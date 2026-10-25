/*
 * /api/billing: paying for a Parchi plan with Dodo Payments.
 *
 *   POST /api/billing?action=order    { plan }          signed-in seller -> a Dodo checkout page to send them to
 *   POST /api/billing?action=verify   { payment_id }    signed-in seller -> back from checkout: checks the payment, starts the pass
 *   POST /api/billing?action=webhook  (from Dodo)       Dodo             -> same, in case the seller closed the page
 *
 * A pass is recorded only after Dodo's own API confirms the payment succeeded, in INR, for a checkout this app
 * created, for the right amount. The database function billing_record_payment is safe to call twice, so the
 * return page and the webhook can both report the same payment.
 *
 * Database note: the billing_passes columns are still called razorpay_order_id / razorpay_payment_id (they were
 * created for Razorpay). They now hold the Dodo checkout session ID (cks_...) and payment ID (pay_...).
 * Renaming them would need a database change, so they keep their names.
 *
 * Environment variables (Cloudflare Pages > Settings > Variables and secrets):
 *   DODO_API_KEY              API key from Dodo > Developer > API Keys (Secret)
 *   DODO_WEBHOOK_SECRET       whsec_... from Dodo > Developer > Webhooks > your endpoint (Secret)
 *   DODO_MODE                 "test" while testing, "live" once your Dodo account is approved (Text)
 *   DODO_PRODUCT_STARTER, DODO_PRODUCT_GROWTH, DODO_PRODUCT_PRO   product IDs (pdt_...) from Dodo > Products (Text)
 *   SUPABASE_SECRET_KEY       sb_secret_... Never prefix with VITE_.
 *   VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY   the same values the app uses
 *
 * Runs on Cloudflare Pages through functions/api/billing.ts. This file has no local imports so it builds on its own.
 */

export const PLANS = {
  starter: { name: "Starter", amount: 24900, productVar: "DODO_PRODUCT_STARTER" },
  growth: { name: "Growth", amount: 34900, productVar: "DODO_PRODUCT_GROWTH" },
  pro: { name: "Pro", amount: 49900, productVar: "DODO_PRODUCT_PRO" },
} as const;
export type PlanId = keyof typeof PLANS;

const DODO_API = { test: "https://test.dodopayments.com", live: "https://live.dodopayments.com" } as const;
const MAX_BODY = 64_000;
/** Webhooks older or newer than this are refused (replay protection, as in the Standard Webhooks spec). */
const WEBHOOK_TOLERANCE_S = 5 * 60;

export interface Env {
  /** Only for automated tests: send Dodo API calls to a stand-in server. Leave unset in production. */
  DODO_API_BASE?: string;
  DODO_API_KEY?: string;
  DODO_WEBHOOK_SECRET?: string;
  DODO_MODE?: string;
  DODO_PRODUCT_STARTER?: string;
  DODO_PRODUCT_GROWTH?: string;
  DODO_PRODUCT_PRO?: string;
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
// Webhook signatures (Standard Webhooks: HMAC-SHA256 of "id.timestamp.body", base64), constant-time compare
// ---------------------------------------------------------------------------------------------

function b64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToB64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

export function safeEqual(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** The base64 signature Dodo puts after "v1," for this message. */
export async function webhookSignature(secret: string, id: string, timestamp: string, body: string): Promise<string> {
  const keyBytes = b64ToBytes(secret.startsWith("whsec_") ? secret.slice(6) : secret);
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${id}.${timestamp}.${body}`));
  return bytesToB64(new Uint8Array(sig));
}

export async function verifyWebhook(secret: string, headers: Headers, body: string, nowS = Math.floor(Date.now() / 1000)): Promise<boolean> {
  const id = headers.get("webhook-id") ?? "";
  const ts = headers.get("webhook-timestamp") ?? "";
  const sigHeader = headers.get("webhook-signature") ?? "";
  if (!id || !/^\d{1,12}$/.test(ts) || !sigHeader) return false;
  if (Math.abs(nowS - Number(ts)) > WEBHOOK_TOLERANCE_S) return false;
  let expected: string;
  try {
    expected = await webhookSignature(secret, id, ts, body);
  } catch {
    return false; // secret isn't valid base64
  }
  return sigHeader
    .split(" ")
    .filter(Boolean)
    .some((part) => {
      const [version, sig] = part.split(",", 2);
      return version === "v1" && typeof sig === "string" && safeEqual(sig, expected);
    });
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
// Dodo API
// ---------------------------------------------------------------------------------------------

function dodoBase(env: Env): string {
  if (env.DODO_API_BASE) return env.DODO_API_BASE.replace(/\/+$/, "");
  return env.DODO_MODE === "live" ? DODO_API.live : DODO_API.test;
}

async function dodo<T>(env: Env, f: Fetch, path: string, body?: unknown): Promise<T> {
  const res = await f(`${dodoBase(env)}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { authorization: `Bearer ${env.DODO_API_KEY}`, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  const text = await res.text();
  if (!res.ok) {
    console.error("Dodo error", path.replace(/pay_[A-Za-z0-9]+/, "pay_…"), res.status, text.slice(0, 500));
    throw new Error(`dodo_${res.status}`);
  }
  return JSON.parse(text) as T;
}

interface DodoPayment {
  payment_id: string;
  status: string | null;
  total_amount: number;
  currency: string;
  checkout_session_id?: string | null;
  metadata?: Record<string, string> | null;
}

const PAYMENT_ID_RE = /^pay_[A-Za-z0-9]{4,64}$/;

interface PassRow {
  plan: string;
  starts_at: string;
  ends_at: string;
  status: string;
}

async function record(env: Env, f: Fetch, p: DodoPayment): Promise<PassRow> {
  return rpc<PassRow>(env, f, "billing_record_payment", {
    p_order_id: p.checkout_session_id,
    p_payment_id: p.payment_id,
    p_amount_paise: p.total_amount,
  });
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

async function createCheckout(request: Request, env: Env, f: Fetch): Promise<Response> {
  const user = await currentUser(env, request, f);
  if (!user) return fail(401, "not_signed_in", "Your session has ended. Please sign in again.");
  const body = await readJson(request);
  const plan = typeof body?.plan === "string" ? body.plan : "";
  if (!(plan in PLANS)) return fail(400, "unknown_plan", "Choose a plan.");
  const productId = (env[PLANS[plan as PlanId].productVar] ?? "").trim();
  if (!productId) return NOT_SET_UP();

  try {
    await rpc<number>(env, f, "billing_quote", { p_user_id: user.id, p_plan: plan });
  } catch (e) {
    const msg = (e as Error).message;
    if (msg.includes("pass_already_waiting")) {
      return fail(409, "pass_already_waiting", "Your next pass is already paid for. You can buy another once it starts.");
    }
    if (msg.includes("business_not_set_up")) return fail(400, "business_not_set_up", "Set up your business first.");
    console.error("billing_quote failed", (e as DbError).status, msg.slice(0, 300));
    return fail(502, "server_error", "Couldn't start the payment. Please try again.");
  }

  const origin = new URL(request.url).origin;
  let session: { session_id: string; checkout_url?: string | null };
  try {
    session = await dodo(env, f, "/checkouts", {
      product_cart: [{ product_id: productId, quantity: 1 }],
      customer: { email: user.email },
      billing_address: { country: "IN" },
      return_url: `${origin}/plan`,
      cancel_url: `${origin}/plan`,
      metadata: { user_id: user.id, plan },
      feature_flags: { allow_discount_code: false, allow_currency_selection: false },
    });
    if (!session?.session_id || !session.checkout_url) throw new Error("dodo_no_checkout_url");
    await rpc(env, f, "billing_order_created", { p_user_id: user.id, p_plan: plan, p_order_id: session.session_id });
  } catch (e) {
    console.error("Creating the checkout failed", String(e).slice(0, 300));
    return fail(502, "server_error", "Couldn't start the payment. Please try again.");
  }

  return json({ ok: true, checkoutUrl: session.checkout_url, plan, planName: PLANS[plan as PlanId].name });
}

/** Checks a payment with Dodo and records the pass. Shared by the return page and the webhook. */
async function confirmAndRecord(
  env: Env,
  f: Fetch,
  paymentId: string,
  expectUserId: string | null,
): Promise<{ kind: "recorded"; pass: PassRow } | { kind: "not_paid"; status: string | null } | { kind: "ignored"; why: string }> {
  const p = await dodo<DodoPayment>(env, f, `/payments/${encodeURIComponent(paymentId)}`);
  if (p.payment_id !== paymentId) return { kind: "ignored", why: "payment id mismatch" };
  if (!p.checkout_session_id) return { kind: "ignored", why: "not from a checkout" };
  if (expectUserId && p.metadata?.user_id !== expectUserId) return { kind: "ignored", why: "someone else's payment" };
  if (p.status !== "succeeded") return { kind: "not_paid", status: p.status };
  if (p.currency !== "INR") return { kind: "ignored", why: "not INR" };
  return { kind: "recorded", pass: await record(env, f, p) };
}

async function verifyPayment(request: Request, env: Env, f: Fetch): Promise<Response> {
  const user = await currentUser(env, request, f);
  if (!user) return fail(401, "not_signed_in", "Your session has ended. Please sign in again.");
  const body = await readJson(request);
  const paymentId = typeof body?.payment_id === "string" ? body.payment_id : "";
  if (!PAYMENT_ID_RE.test(paymentId)) return fail(400, "bad_request", "Payment details are missing.");

  try {
    const r = await confirmAndRecord(env, f, paymentId, user.id);
    if (r.kind === "recorded") return json({ ok: true, pass: { plan: r.pass.plan, starts_at: r.pass.starts_at, ends_at: r.pass.ends_at } });
    if (r.kind === "not_paid") {
      if (r.status === "processing" || r.status === "requires_customer_action" || r.status === "requires_confirmation" || r.status === null) {
        return fail(202, "pending", "Your payment is still being confirmed. Your plan will start as soon as it goes through. Refresh this page in a minute.");
      }
      return fail(402, "not_paid", "The payment didn't go through. You haven't been charged for a pass.");
    }
    console.error("Payment can't start a pass", paymentId, r.why);
    return fail(400, "not_ours", "We couldn't match this payment to your account. If money was taken, write to us and we'll sort it out.");
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === "dodo_404") return fail(400, "not_ours", "We couldn't find this payment. If money was taken, write to us and we'll sort it out.");
    if (msg.includes("amount_mismatch") || msg.includes("order_already_paid") || msg.includes("order_not_found")) {
      console.error("Payment needs a look in the Dodo dashboard", msg, paymentId);
      return fail(409, "needs_review", "We received your payment but couldn't start the plan automatically. Write to us with your account email and we'll fix it.");
    }
    console.error("Recording the payment failed", paymentId, String(e).slice(0, 300));
    // The webhook will record it once Dodo reports it, so the seller isn't charged without a pass.
    return fail(502, "pending", "Payment received. Your plan will be ready in a minute. Refresh this page shortly.");
  }
}

async function webhook(request: Request, env: Env, f: Fetch): Promise<Response> {
  const raw = await request.text().catch(() => "");
  if (!raw || raw.length > 1_000_000) return fail(400, "bad_request", "Bad request.");
  if (!(await verifyWebhook(env.DODO_WEBHOOK_SECRET ?? "", request.headers, raw))) {
    console.error("Webhook signature didn't match");
    return fail(401, "bad_signature", "Bad signature.");
  }

  let event: { type?: string; data?: { payment_id?: string } };
  try {
    event = JSON.parse(raw);
  } catch {
    return fail(400, "bad_request", "Bad request.");
  }
  if (event.type !== "payment.succeeded") return json({ ok: true, ignored: event.type ?? null });
  const paymentId = event.data?.payment_id ?? "";
  if (!PAYMENT_ID_RE.test(paymentId)) return json({ ok: true, ignored: "no payment id" });

  try {
    // Ask Dodo directly rather than trusting the event body.
    const r = await confirmAndRecord(env, f, paymentId, null);
    if (r.kind === "recorded") return json({ ok: true });
    if (r.kind === "not_paid") return fail(500, "retry", "Not settled yet."); // Dodo retries later
    return json({ ok: true, ignored: r.why });
  } catch (e) {
    const msg = (e as Error).message;
    // Payments for other things on the same Dodo account aren't ours: acknowledge so Dodo stops retrying.
    if (msg === "dodo_404") return json({ ok: true, ignored: "unknown payment" });
    if (msg.includes("order_not_found")) return json({ ok: true, ignored: "unknown checkout" });
    if (msg.includes("amount_mismatch") || msg.includes("order_already_paid")) {
      console.error("Webhook payment needs a look in the Dodo dashboard", msg, paymentId);
      return json({ ok: true, ignored: msg });
    }
    console.error("Webhook could not record the payment, Dodo will retry", String(e).slice(0, 300));
    return fail(500, "retry", "Try again.");
  }
}

export async function handleBilling(request: Request, env: Env, f: Fetch = fetch): Promise<Response> {
  if (request.method !== "POST") return fail(405, "method_not_allowed", "Use POST.");
  const action = new URL(request.url).searchParams.get("action");
  const ready = env.DODO_API_KEY && env.SUPABASE_SECRET_KEY && env.VITE_SUPABASE_URL && env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (action === "webhook") return ready && env.DODO_WEBHOOK_SECRET ? webhook(request, env, f) : NOT_SET_UP();
  if (!ready) return NOT_SET_UP();
  if (action === "order") return createCheckout(request, env, f);
  if (action === "verify") return verifyPayment(request, env, f);
  return fail(404, "not_found", "Not found.");
}
