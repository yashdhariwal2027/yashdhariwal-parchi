/*
 * /api/billing: paying for a Parchi plan with Razorpay.
 *
 *   POST /api/billing?action=order    { plan }                  signed-in seller  -> Razorpay order for checkout
 *   POST /api/billing?action=verify   { razorpay_order_id, razorpay_payment_id, razorpay_signature }
 *                                                               signed-in seller  -> checks the payment, starts the pass
 *   POST /api/billing?action=webhook  (raw body from Razorpay)  Razorpay          -> same, in case the browser closed
 *
 * The pass is recorded only after the payment is proven: a signature made with your Razorpay secret, then a
 * check with Razorpay's API that the payment is captured for the right order and amount. The database
 * function billing_record_payment is safe to call twice, so the checkout and the webhook can both report it.
 *
 * Environment variables (Vercel > Settings > Environment Variables):
 *   RAZORPAY_KEY_ID           rzp_test_... while testing, rzp_live_... once your account is activated
 *   RAZORPAY_KEY_SECRET       from the same screen as the key ID. Never prefix with VITE_.
 *   RAZORPAY_WEBHOOK_SECRET   the secret you type when adding the webhook in the Razorpay dashboard
 *   SUPABASE_SECRET_KEY       sb_secret_... from Supabase > Project Settings > API Keys. Never prefix with VITE_.
 *   VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY   the same values the app uses
 *
 * Runs on Cloudflare Pages through functions/api/billing.ts (which passes the environment in). The default
 * export at the bottom is for Vercel. This file deliberately has no local imports so it builds on its own.
 */

export const PLANS = {
  starter: { name: "Starter", amount: 24900 },
  growth: { name: "Growth", amount: 34900 },
  pro: { name: "Pro", amount: 49900 },
} as const;
export type PlanId = keyof typeof PLANS;

const RAZORPAY_API = "https://api.razorpay.com/v1";
const MAX_BODY = 64_000;

interface Env {
  /** Only for automated tests: send Razorpay API calls to a stand-in server. Leave unset in production. */
  RAZORPAY_API_BASE?: string;
  RAZORPAY_KEY_ID?: string;
  RAZORPAY_KEY_SECRET?: string;
  RAZORPAY_WEBHOOK_SECRET?: string;
  SUPABASE_SECRET_KEY?: string;
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_PUBLISHABLE_KEY?: string;
}

type Fetch = typeof fetch;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

function fail(status: number, error: string, message: string): Response {
  return json({ ok: false, error, message }, status);
}

const NOT_SET_UP = () => fail(503, "not_configured", "Payments aren't set up yet. Please try again later.");

// ---------------------------------------------------------------------------------------------
// Signatures (HMAC-SHA256, hex), compared in constant time
// ---------------------------------------------------------------------------------------------

export async function hmacHex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(message)));
  return Array.from(sig, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function safeEqual(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// ---------------------------------------------------------------------------------------------
// Supabase: who is signed in (their token), and the billing functions (secret key, server only)
// ---------------------------------------------------------------------------------------------

function supabaseBase(env: Env) {
  return (env.VITE_SUPABASE_URL ?? "").replace(/\/+$/, "");
}

async function currentUser(env: Env, request: Request, f: Fetch): Promise<{ id: string; email: string } | null> {
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token) return null;
  const res = await f(`${supabaseBase(env)}/auth/v1/user`, {
    headers: { apikey: env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "", authorization: `Bearer ${token}` },
  }).catch(() => null);
  if (!res || !res.ok) return null;
  const u = (await res.json().catch(() => null)) as { id?: string; email?: string } | null;
  return u?.id ? { id: u.id, email: u.email ?? "" } : null;
}

class DbError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

/** Calls a database function with the secret key (Postgres role service_role). */
async function rpc<T>(env: Env, f: Fetch, fn: string, args: Record<string, unknown>): Promise<T> {
  const res = await f(`${supabaseBase(env)}/rest/v1/rpc/${fn}`, {
    method: "POST",
    // New Supabase secret keys go in the apikey header only (they are not JWTs).
    headers: { apikey: env.SUPABASE_SECRET_KEY ?? "", "content-type": "application/json" },
    body: JSON.stringify(args),
  });
  const text = await res.text();
  if (!res.ok) {
    let msg = text;
    try {
      msg = (JSON.parse(text) as { message?: string }).message ?? text;
    } catch {
      /* keep the text */
    }
    throw new DbError(msg, res.status);
  }
  return (text ? JSON.parse(text) : null) as T;
}

// ---------------------------------------------------------------------------------------------
// Razorpay API
// ---------------------------------------------------------------------------------------------

function razorpayAuth(env: Env): string {
  return "Basic " + btoa(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`);
}

async function razorpay<T>(env: Env, f: Fetch, path: string, body?: unknown): Promise<T> {
  const res = await f(`${(env.RAZORPAY_API_BASE || RAZORPAY_API).replace(/\/+$/, "")}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { authorization: razorpayAuth(env), "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  const text = await res.text();
  if (!res.ok) {
    console.error("Razorpay error", path.replace(/pay_[A-Za-z0-9]+/, "pay_…"), res.status, text.slice(0, 500));
    throw new Error(`razorpay_${res.status}`);
  }
  return JSON.parse(text) as T;
}

interface RazorpayPayment {
  id: string;
  order_id: string | null;
  amount: number;
  currency: string;
  status: "created" | "authorized" | "captured" | "refunded" | "failed";
}

/** Makes sure the payment is captured for this order, capturing it if it was only authorised. */
async function confirmPayment(env: Env, f: Fetch, orderId: string, paymentId: string): Promise<RazorpayPayment | null> {
  let p = await razorpay<RazorpayPayment>(env, f, `/payments/${encodeURIComponent(paymentId)}`);
  if (p.order_id !== orderId || p.currency !== "INR") return null;
  if (p.status === "authorized") {
    p = await razorpay<RazorpayPayment>(env, f, `/payments/${encodeURIComponent(paymentId)}/capture`, { amount: p.amount, currency: "INR" });
  }
  return p.status === "captured" ? p : null;
}

interface PassRow {
  plan: string;
  starts_at: string;
  ends_at: string;
  status: string;
}

async function record(env: Env, f: Fetch, orderId: string, paymentId: string, amount: number): Promise<PassRow> {
  return rpc<PassRow>(env, f, "billing_record_payment", { p_order_id: orderId, p_payment_id: paymentId, p_amount_paise: amount });
}

// ---------------------------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------------------------

async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  const raw = await request.text().catch(() => "");
  if (!raw || raw.length > MAX_BODY) return null;
  try {
    const v = JSON.parse(raw);
    return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

async function createOrder(request: Request, env: Env, f: Fetch): Promise<Response> {
  const user = await currentUser(env, request, f);
  if (!user) return fail(401, "not_signed_in", "Your session has ended. Please sign in again.");
  const body = await readJson(request);
  const plan = typeof body?.plan === "string" ? body.plan : "";
  if (!(plan in PLANS)) return fail(400, "unknown_plan", "Choose a plan.");

  let amount: number;
  try {
    amount = await rpc<number>(env, f, "billing_quote", { p_user_id: user.id, p_plan: plan });
  } catch (e) {
    const msg = (e as Error).message;
    if (msg.includes("pass_already_waiting")) {
      return fail(409, "pass_already_waiting", "Your next pass is already paid for. You can buy another once it starts.");
    }
    if (msg.includes("business_not_set_up")) return fail(400, "business_not_set_up", "Set up your business first.");
    console.error("billing_quote failed", (e as DbError).status, msg.slice(0, 300));
    return fail(502, "server_error", "Couldn't start the payment. Please try again.");
  }

  let order: { id: string; amount: number; currency: string };
  try {
    order = await razorpay(env, f, "/orders", {
      amount,
      currency: "INR",
      receipt: `parchi-${plan}-${Date.now()}`.slice(0, 40),
      notes: { user_id: user.id, plan },
    });
    if (order.amount !== amount) throw new Error("razorpay_amount");
    await rpc(env, f, "billing_order_created", { p_user_id: user.id, p_plan: plan, p_order_id: order.id });
  } catch (e) {
    console.error("Creating the order failed", String(e).slice(0, 300));
    return fail(502, "server_error", "Couldn't start the payment. Please try again.");
  }

  return json({
    ok: true,
    keyId: env.RAZORPAY_KEY_ID,
    orderId: order.id,
    amount,
    currency: "INR",
    plan,
    planName: PLANS[plan as PlanId].name,
    email: user.email,
  });
}

async function verifyPayment(request: Request, env: Env, f: Fetch): Promise<Response> {
  const user = await currentUser(env, request, f);
  if (!user) return fail(401, "not_signed_in", "Your session has ended. Please sign in again.");
  const body = await readJson(request);
  const orderId = typeof body?.razorpay_order_id === "string" ? body.razorpay_order_id : "";
  const paymentId = typeof body?.razorpay_payment_id === "string" ? body.razorpay_payment_id : "";
  const signature = typeof body?.razorpay_signature === "string" ? body.razorpay_signature : "";
  if (!orderId || !paymentId || !signature) return fail(400, "bad_request", "Payment details are missing.");

  const expected = await hmacHex(env.RAZORPAY_KEY_SECRET ?? "", `${orderId}|${paymentId}`);
  if (!safeEqual(expected, signature)) {
    console.error("Payment signature didn't match", orderId);
    return fail(400, "bad_signature", "We couldn't confirm this payment. If money was taken, it will be refunded automatically.");
  }

  try {
    const payment = await confirmPayment(env, f, orderId, paymentId);
    if (!payment) return fail(402, "not_captured", "The payment didn't go through. You haven't been charged for a pass.");
    const pass = await record(env, f, orderId, paymentId, payment.amount);
    return json({ ok: true, pass: { plan: pass.plan, starts_at: pass.starts_at, ends_at: pass.ends_at } });
  } catch (e) {
    console.error("Recording the payment failed", orderId, String(e).slice(0, 300));
    // The webhook will record it once Razorpay reports it, so the seller isn't charged without a pass.
    return fail(502, "pending", "Payment received. Your plan will be ready in a minute. Refresh this page shortly.");
  }
}

async function webhook(request: Request, env: Env, f: Fetch): Promise<Response> {
  const raw = await request.text().catch(() => "");
  const signature = request.headers.get("x-razorpay-signature") ?? "";
  if (!raw || raw.length > 1_000_000 || !signature || !env.RAZORPAY_WEBHOOK_SECRET) return fail(400, "bad_request", "Bad request.");
  const expected = await hmacHex(env.RAZORPAY_WEBHOOK_SECRET, raw);
  if (!safeEqual(expected, signature)) {
    console.error("Webhook signature didn't match");
    return fail(400, "bad_signature", "Bad signature.");
  }

  let event: { event?: string; payload?: { payment?: { entity?: RazorpayPayment } } };
  try {
    event = JSON.parse(raw);
  } catch {
    return fail(400, "bad_request", "Bad request.");
  }
  if (event.event !== "payment.captured" && event.event !== "order.paid") return json({ ok: true, ignored: event.event ?? null });
  const p = event.payload?.payment?.entity;
  if (!p?.id || !p.order_id || p.status !== "captured" || p.currency !== "INR") return json({ ok: true, ignored: "not a captured INR payment" });

  try {
    await record(env, f, p.order_id, p.id, p.amount);
    return json({ ok: true });
  } catch (e) {
    const msg = (e as Error).message;
    // Payments for other things on the same Razorpay account aren't ours: acknowledge so Razorpay stops retrying.
    if (msg.includes("order_not_found")) return json({ ok: true, ignored: "unknown order" });
    if (msg.includes("amount_mismatch") || msg.includes("order_already_paid")) {
      console.error("Webhook payment needs a look in the Razorpay dashboard", msg, p.order_id);
      return json({ ok: true, ignored: msg });
    }
    console.error("Webhook could not record the payment, Razorpay will retry", String(e).slice(0, 300));
    return fail(500, "retry", "Try again.");
  }
}

export async function handleBilling(request: Request, env: Env, f: Fetch = fetch): Promise<Response> {
  if (request.method !== "POST") return fail(405, "method_not_allowed", "Use POST.");
  const action = new URL(request.url).searchParams.get("action");
  const ready = env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET && env.SUPABASE_SECRET_KEY && env.VITE_SUPABASE_URL && env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (action === "webhook") return ready && env.RAZORPAY_WEBHOOK_SECRET ? webhook(request, env, f) : NOT_SET_UP();
  if (!ready) return NOT_SET_UP();
  if (action === "order") return createOrder(request, env, f);
  if (action === "verify") return verifyPayment(request, env, f);
  return fail(404, "not_found", "Not found.");
}

export default {
  fetch(request: Request): Promise<Response> {
    // (Read through globalThis so this file needs no Node type definitions to compile on Vercel.)
    const env = (globalThis as unknown as { process: { env: Env } }).process.env;
    return handleBilling(request, env);
  },
};
