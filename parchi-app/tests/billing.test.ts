import { test } from "node:test";
import assert from "node:assert/strict";
import { handleBilling, hmacHex, safeEqual } from "../api/billing";

const ENV = {
  RAZORPAY_KEY_ID: "rzp_test_abc",
  RAZORPAY_KEY_SECRET: "rzp_secret_xyz",
  RAZORPAY_WEBHOOK_SECRET: "whsec_123",
  SUPABASE_SECRET_KEY: "sb_secret_test",
  VITE_SUPABASE_URL: "https://proj.supabase.co",
  VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
};
const USER = { id: "11111111-1111-1111-1111-111111111111", email: "noor@example.com" };

interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

/** Fake Supabase + Razorpay. `db` mimics the billing functions; `payments` are what Razorpay reports. */
function world(opts: { quoteError?: string; recordError?: string; payment?: Record<string, unknown>; captureTo?: string } = {}) {
  const calls: Call[] = [];
  const recorded: unknown[] = [];
  const f = (async (input: string | URL, init: RequestInit = {}) => {
    const url = String(input);
    const headers = Object.fromEntries(Object.entries((init.headers as Record<string, string>) ?? {}).map(([k, v]) => [k.toLowerCase(), v]));
    const body = init.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ url, method: init.method ?? "GET", headers, body });
    const ok = (b: unknown) => new Response(JSON.stringify(b), { status: 200 });
    if (url.endsWith("/auth/v1/user")) {
      return headers.authorization === "Bearer good-token" ? ok(USER) : new Response("{}", { status: 401 });
    }
    if (url.includes("/rest/v1/rpc/")) {
      if (headers.apikey !== "sb_secret_test" || headers.authorization) return new Response('{"message":"bad key"}', { status: 401 });
      const fn = url.split("/rpc/")[1];
      if (fn === "billing_quote") {
        if (opts.quoteError) return new Response(JSON.stringify({ message: opts.quoteError }), { status: 400 });
        return ok({ starter: 24900, growth: 34900, pro: 49900 }[(body as { p_plan: string }).p_plan]);
      }
      if (fn === "billing_order_created") return ok(null);
      if (fn === "billing_record_payment") {
        if (opts.recordError) return new Response(JSON.stringify({ message: opts.recordError }), { status: 400 });
        recorded.push(body);
        return ok({ plan: "growth", status: "paid", starts_at: "2026-10-16T00:00:00Z", ends_at: "2026-11-15T00:00:00Z" });
      }
    }
    if (url === "https://api.razorpay.com/v1/orders") {
      assert.equal(headers.authorization, "Basic " + btoa("rzp_test_abc:rzp_secret_xyz"));
      const b = body as { amount: number; currency: string; receipt: string };
      return ok({ id: "order_ABC", amount: b.amount, currency: b.currency });
    }
    const pm = url.match(/\/v1\/payments\/([^/]+)(\/capture)?$/);
    if (pm) {
      const base = { id: pm[1], order_id: "order_ABC", amount: 34900, currency: "INR", status: "captured", ...opts.payment };
      if (pm[2]) return ok({ ...base, status: opts.captureTo ?? "captured" });
      return ok(base);
    }
    throw new Error("unexpected " + url);
  }) as typeof fetch;
  return { f, calls, recorded };
}

const post = (action: string, body: unknown, token: string | null = "good-token", extra: Record<string, string> = {}) =>
  new Request(`https://app.example/api/billing?action=${action}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}), ...extra },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

test("signatures: HMAC-SHA256 hex, same as Razorpay's documented formula", async () => {
  // Known vector (RFC 4231 test case 2)
  assert.equal(await hmacHex("Jefe", "what do ya want for nothing?"), "5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843");
  assert.ok(safeEqual("abc", "abc"));
  assert.ok(!safeEqual("abc", "abd"));
  assert.ok(!safeEqual("abc", "abcd"));
});

test("order: signed-in seller gets a Razorpay order for the database's price", async () => {
  const w = world();
  const res = await handleBilling(post("order", { plan: "growth" }), ENV, w.f);
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.deepEqual(
    { ok: body.ok, keyId: body.keyId, orderId: body.orderId, amount: body.amount, currency: body.currency, planName: body.planName, email: body.email },
    { ok: true, keyId: "rzp_test_abc", orderId: "order_ABC", amount: 34900, currency: "INR", planName: "Growth", email: "noor@example.com" },
  );
  const order = w.calls.find((c) => c.url.endsWith("/v1/orders"))!;
  assert.deepEqual((order.body as { notes: unknown }).notes, { user_id: USER.id, plan: "growth" });
  assert.ok(((order.body as { receipt: string }).receipt).length <= 40);
  const created = w.calls.find((c) => c.url.endsWith("/billing_order_created"))!;
  assert.deepEqual(created.body, { p_user_id: USER.id, p_plan: "growth", p_order_id: "order_ABC" });
  assert.ok(!JSON.stringify(body).includes("rzp_secret"), "the key secret never reaches the browser");
});

test("order: refusals", async () => {
  const w = world();
  assert.equal((await handleBilling(post("order", { plan: "growth" }, null), ENV, w.f)).status, 401);
  assert.equal((await handleBilling(post("order", { plan: "growth" }, "bad-token"), ENV, w.f)).status, 401);
  assert.equal((await handleBilling(post("order", { plan: "gold" }), ENV, w.f)).status, 400);
  assert.equal((await handleBilling(post("order", "{not json"), ENV, w.f)).status, 400);
  const waiting = world({ quoteError: "pass_already_waiting" });
  const r = await handleBilling(post("order", { plan: "pro" }), ENV, waiting.f);
  assert.equal(r.status, 409);
  assert.match((await r.json()).message, /already paid for/);
  assert.equal(waiting.calls.filter((c) => c.url.includes("razorpay")).length, 0, "no Razorpay order when buying isn't allowed");
  assert.equal((await handleBilling(post("order", { plan: "pro" }), { ...ENV, RAZORPAY_KEY_SECRET: "" }, w.f)).status, 503);
  assert.equal((await handleBilling(new Request("https://app.example/api/billing?action=order"), ENV, w.f)).status, 405);
});

async function signed(order = "order_ABC", payment = "pay_XYZ", secret = ENV.RAZORPAY_KEY_SECRET) {
  return { razorpay_order_id: order, razorpay_payment_id: payment, razorpay_signature: await hmacHex(secret, `${order}|${payment}`) };
}

test("verify: a genuine, captured payment starts the pass", async () => {
  const w = world();
  const res = await handleBilling(post("verify", await signed()), ENV, w.f);
  assert.equal(res.status, 200);
  assert.deepEqual((await res.json()).pass, { plan: "growth", starts_at: "2026-10-16T00:00:00Z", ends_at: "2026-11-15T00:00:00Z" });
  assert.deepEqual(w.recorded, [{ p_order_id: "order_ABC", p_payment_id: "pay_XYZ", p_amount_paise: 34900 }]);
});

test("verify: forged or mismatched payments are refused", async () => {
  const w = world();
  const forged = await signed("order_ABC", "pay_XYZ", "wrong-secret");
  assert.equal((await handleBilling(post("verify", forged), ENV, w.f)).status, 400);
  const swapped = { ...(await signed()), razorpay_payment_id: "pay_OTHER" };
  assert.equal((await handleBilling(post("verify", swapped), ENV, w.f)).status, 400);
  assert.equal(w.recorded.length, 0);
  assert.equal(w.calls.filter((c) => c.url.includes("razorpay")).length, 0, "Razorpay isn't even asked for forged requests");

  const otherOrder = world({ payment: { order_id: "order_SOMEONE_ELSE" } });
  assert.equal((await handleBilling(post("verify", await signed()), ENV, otherOrder.f)).status, 402);
  const failed = world({ payment: { status: "failed" } });
  assert.equal((await handleBilling(post("verify", await signed()), ENV, failed.f)).status, 402);
  const usd = world({ payment: { currency: "USD" } });
  assert.equal((await handleBilling(post("verify", await signed()), ENV, usd.f)).status, 402);
  assert.equal(otherOrder.recorded.length + failed.recorded.length + usd.recorded.length, 0);
  assert.equal((await handleBilling(post("verify", await signed(), null), ENV, w.f)).status, 401);
});

test("verify: an authorised payment is captured first", async () => {
  const w = world({ payment: { status: "authorized" } });
  assert.equal((await handleBilling(post("verify", await signed()), ENV, w.f)).status, 200);
  const cap = w.calls.find((c) => c.url.endsWith("/capture"))!;
  assert.deepEqual(cap.body, { amount: 34900, currency: "INR" });
  const stuck = world({ payment: { status: "authorized" }, captureTo: "authorized" });
  assert.equal((await handleBilling(post("verify", await signed()), ENV, stuck.f)).status, 402);
});

test("verify: if recording fails, the seller is told the plan will follow (the webhook records it)", async () => {
  const w = world({ recordError: "connection reset" });
  const res = await handleBilling(post("verify", await signed()), ENV, w.f);
  assert.equal(res.status, 502);
  assert.match((await res.json()).message, /Payment received/);
});

function webhookRequest(payload: unknown, secret = ENV.RAZORPAY_WEBHOOK_SECRET) {
  const raw = JSON.stringify(payload);
  return hmacHex(secret, raw).then(
    (sig) => new Request("https://app.example/api/billing?action=webhook", { method: "POST", headers: { "x-razorpay-signature": sig, "content-type": "application/json" }, body: raw }),
  );
}

const captured = (over: Record<string, unknown> = {}) => ({
  event: "payment.captured",
  payload: { payment: { entity: { id: "pay_XYZ", order_id: "order_ABC", amount: 34900, currency: "INR", status: "captured", ...over } } },
});

test("webhook: records captured payments, checks the signature, ignores what isn't ours", async () => {
  const w = world();
  assert.equal((await handleBilling(await webhookRequest(captured()), ENV, w.f)).status, 200);
  assert.equal((await handleBilling(await webhookRequest({ ...captured(), event: "order.paid" }), ENV, w.f)).status, 200);
  assert.equal(w.recorded.length, 2, "both events record (the database makes the second one a no-op)");

  const forged = await webhookRequest(captured(), "not-the-secret");
  assert.equal((await handleBilling(forged, ENV, w.f)).status, 400);
  const tampered = new Request("https://app.example/api/billing?action=webhook", {
    method: "POST",
    headers: { "x-razorpay-signature": await hmacHex(ENV.RAZORPAY_WEBHOOK_SECRET, JSON.stringify(captured())) },
    body: JSON.stringify(captured({ amount: 1 })),
  });
  assert.equal((await handleBilling(tampered, ENV, w.f)).status, 400);
  assert.equal(w.recorded.length, 2);

  const ignored = await (await handleBilling(await webhookRequest({ event: "payment.failed", payload: {} }), ENV, w.f)).json();
  assert.equal(ignored.ignored, "payment.failed");
  const notOurs = world({ recordError: "order_not_found" });
  const r = await handleBilling(await webhookRequest(captured()), ENV, notOurs.f);
  assert.equal(r.status, 200, "other payments on the same Razorpay account are acknowledged, not retried forever");
  const down = world({ recordError: "connection reset" });
  assert.equal((await handleBilling(await webhookRequest(captured()), ENV, down.f)).status, 500, "a database hiccup asks Razorpay to retry");
  const noToken = await handleBilling(await webhookRequest(captured()), { ...ENV, RAZORPAY_WEBHOOK_SECRET: "" }, w.f);
  assert.equal(noToken.status, 503);
});
