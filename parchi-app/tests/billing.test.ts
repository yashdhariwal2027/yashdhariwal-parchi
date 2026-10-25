import { test } from "node:test";
import assert from "node:assert/strict";
import { handleBilling, safeEqual, verifyWebhook, webhookSignature, type Env } from "../api/billing";

const WH_SECRET = "whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw";
const ENV: Env = {
  DODO_API_KEY: "dodo_test_key",
  DODO_WEBHOOK_SECRET: WH_SECRET,
  DODO_MODE: "test",
  DODO_PRODUCT_STARTER: "pdt_starter",
  DODO_PRODUCT_GROWTH: "pdt_growth",
  DODO_PRODUCT_PRO: "pdt_pro",
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

/** Fake Supabase + Dodo. `payment` overrides what Dodo reports for GET /payments/{id}. */
function world(opts: { quoteError?: string; recordError?: string; payment?: Record<string, unknown>; checkout?: Record<string, unknown> } = {}) {
  const calls: Call[] = [];
  const recorded: Record<string, unknown>[] = [];
  const created: Record<string, unknown>[] = [];
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
      if (fn === "billing_order_created") {
        created.push(body as Record<string, unknown>);
        return ok(null);
      }
      if (fn === "billing_record_payment") {
        if (opts.recordError) return new Response(JSON.stringify({ message: opts.recordError }), { status: 400 });
        recorded.push(body as Record<string, unknown>);
        return ok({ plan: "growth", status: "paid", starts_at: "2026-10-16T00:00:00Z", ends_at: "2026-11-15T00:00:00Z" });
      }
    }
    if (url.startsWith("https://test.dodopayments.com/") || url.startsWith("https://live.dodopayments.com/")) {
      assert.equal(headers.authorization, "Bearer dodo_test_key");
      const path = url.replace(/^https:\/\/(test|live)\.dodopayments\.com/, "");
      if (path === "/checkouts" && init.method === "POST") {
        return ok({ session_id: "cks_ABC", checkout_url: "https://test.checkout.dodopayments.com/session/cks_ABC", ...opts.checkout });
      }
      const pm = path.match(/^\/payments\/([^/]+)$/);
      if (pm) {
        if (pm[1] === "pay_missing1") return new Response('{"message":"not found"}', { status: 404 });
        return ok({
          payment_id: pm[1],
          status: "succeeded",
          total_amount: 34900,
          currency: "INR",
          checkout_session_id: "cks_ABC",
          metadata: { user_id: USER.id, plan: "growth" },
          ...opts.payment,
        });
      }
    }
    throw new Error("unexpected " + url);
  }) as typeof fetch;
  return { f, calls, recorded, created };
}

const post = (action: string, body: unknown, token: string | null = "good-token", extra: Record<string, string> = {}) =>
  new Request(`https://parchi.site/api/billing?action=${action}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}), ...extra },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

async function signedWebhook(event: unknown, opts: { secret?: string; ts?: number; tamper?: boolean } = {}) {
  const body = JSON.stringify(event);
  const ts = String(opts.ts ?? Math.floor(Date.now() / 1000));
  const sig = await webhookSignature(opts.secret ?? WH_SECRET, "msg_1", ts, body);
  return new Request("https://parchi.site/api/billing?action=webhook", {
    method: "POST",
    headers: { "content-type": "application/json", "webhook-id": "msg_1", "webhook-timestamp": ts, "webhook-signature": `v1,${sig}` },
    body: opts.tamper ? body.replace("pay_", "pay_X") : body,
  });
}

test("webhook signature matches the Standard Webhooks reference vector", async () => {
  // Published test vector from the Standard Webhooks spec (also used by Svix).
  const sig = await webhookSignature(WH_SECRET, "msg_p5jXN8AQM9LWM0D4loKWxJek", "1614265330", '{"test": 2432232314}');
  assert.equal(sig, "g0hM9SsE+OTPJTGt/tmIKtSyZlE3uFJELVlNIOLJ1OE=");
  const h = new Headers({ "webhook-id": "msg_p5jXN8AQM9LWM0D4loKWxJek", "webhook-timestamp": "1614265330", "webhook-signature": `v0,abc v1,${sig}` });
  assert.ok(await verifyWebhook(WH_SECRET, h, '{"test": 2432232314}', 1614265330 + 60));
  assert.ok(!(await verifyWebhook(WH_SECRET, h, '{"test": 2432232315}', 1614265330)), "changed body");
  assert.ok(!(await verifyWebhook(WH_SECRET, h, '{"test": 2432232314}', 1614265330 + 301)), "too old");
  assert.ok(!(await verifyWebhook("whsec_" + btoa("other-secret"), h, '{"test": 2432232314}', 1614265330)), "wrong secret");
  assert.ok(!(await verifyWebhook("not base64 !!", h, '{"test": 2432232314}', 1614265330)), "broken secret");
  assert.ok(safeEqual("abc", "abc") && !safeEqual("abc", "abd") && !safeEqual("abc", "abcd"));
});

test("order: signed-in seller gets a Dodo checkout for the plan's product", async () => {
  const w = world();
  const res = await handleBilling(post("order", { plan: "growth" }), ENV, w.f);
  assert.equal(res.status, 200);
  const b = await res.json();
  assert.equal(b.checkoutUrl, "https://test.checkout.dodopayments.com/session/cks_ABC");
  const co = w.calls.find((c) => c.url === "https://test.dodopayments.com/checkouts")!;
  const body = co.body as Record<string, any>;
  assert.deepEqual(body.product_cart, [{ product_id: "pdt_growth", quantity: 1 }]);
  assert.equal(body.customer.email, USER.email);
  assert.equal(body.billing_address.country, "IN");
  assert.equal(body.return_url, "https://parchi.site/plan");
  assert.deepEqual(body.metadata, { user_id: USER.id, plan: "growth" });
  assert.equal(body.feature_flags.allow_discount_code, false);
  assert.deepEqual(w.created, [{ p_user_id: USER.id, p_plan: "growth", p_order_id: "cks_ABC" }]);
  // Live mode uses the live API
  const w2 = world();
  await handleBilling(post("order", { plan: "pro" }), { ...ENV, DODO_MODE: "live" }, w2.f);
  assert.ok(w2.calls.some((c) => c.url === "https://live.dodopayments.com/checkouts" && (c.body as any).product_cart[0].product_id === "pdt_pro"));
});

test("order: refuses signed-out, unknown plans, missing product IDs, and a pass already waiting", async () => {
  let w = world();
  assert.equal((await handleBilling(post("order", { plan: "growth" }, null), ENV, w.f)).status, 401);
  assert.equal((await handleBilling(post("order", { plan: "gold" }), ENV, w.f)).status, 400);
  assert.equal((await handleBilling(post("order", { plan: "growth" }), { ...ENV, DODO_PRODUCT_GROWTH: "" }, w.f)).status, 503);
  w = world({ quoteError: "pass_already_waiting" });
  const r = await handleBilling(post("order", { plan: "growth" }), ENV, w.f);
  assert.equal(r.status, 409);
  assert.ok(!w.calls.some((c) => c.url.includes("dodopayments")), "no checkout made");
  w = world({ checkout: { checkout_url: null } });
  assert.equal((await handleBilling(post("order", { plan: "growth" }), ENV, w.f)).status, 502);
  assert.equal(w.created.length, 0);
});

test("verify: a succeeded INR payment for this seller starts the pass", async () => {
  const w = world();
  const res = await handleBilling(post("verify", { payment_id: "pay_123abc" }), ENV, w.f);
  assert.equal(res.status, 200);
  assert.equal((await res.json()).pass.plan, "growth");
  assert.deepEqual(w.recorded, [{ p_order_id: "cks_ABC", p_payment_id: "pay_123abc", p_amount_paise: 34900 }]);
});

test("verify: refuses payments that aren't proven, aren't ours or aren't finished", async () => {
  const cases: [Record<string, unknown>, number][] = [
    [{ status: "failed" }, 402],
    [{ status: "processing" }, 202],
    [{ metadata: { user_id: "someone-else" } }, 400],
    [{ checkout_session_id: null }, 400],
    [{ currency: "USD" }, 400],
  ];
  for (const [payment, code] of cases) {
    const w = world({ payment });
    const r = await handleBilling(post("verify", { payment_id: "pay_123abc" }), ENV, w.f);
    assert.equal(r.status, code, JSON.stringify(payment));
    assert.equal(w.recorded.length, 0, JSON.stringify(payment));
  }
  const w = world();
  assert.equal((await handleBilling(post("verify", { payment_id: "../../etc" }), ENV, w.f)).status, 400);
  const missing = await handleBilling(post("verify", { payment_id: "pay_missing1" }), ENV, w.f);
  assert.equal(missing.status, 400);
  assert.equal((await missing.json()).error, "not_ours");
  assert.equal((await handleBilling(post("verify", { payment_id: "pay_123abc" }, "bad"), ENV, w.f)).status, 401);
  // Database says the amount is wrong (e.g. product set up without GST included): no pass, clear message
  const w2 = world({ recordError: "amount_mismatch" });
  const r2 = await handleBilling(post("verify", { payment_id: "pay_123abc" }), ENV, w2.f);
  assert.equal(r2.status, 409);
  assert.equal((await r2.json()).error, "needs_review");
});

test("webhook: signed payment.succeeded records the pass after asking Dodo; anything else is refused or ignored", async () => {
  const ev = { business_id: "bus_1", type: "payment.succeeded", timestamp: new Date().toISOString(), data: { payload_type: "Payment", payment_id: "pay_123abc" } };
  let w = world();
  let r = await handleBilling(await signedWebhook(ev), ENV, w.f);
  assert.equal(r.status, 200);
  assert.equal(w.recorded.length, 1);
  assert.ok(w.calls.some((c) => c.url === "https://test.dodopayments.com/payments/pay_123abc"), "checked with Dodo");

  for (const bad of [{ tamper: true }, { secret: "whsec_" + btoa("wrong") }, { ts: Math.floor(Date.now() / 1000) - 3600 }]) {
    w = world();
    r = await handleBilling(await signedWebhook(ev, bad), ENV, w.f);
    assert.equal(r.status, 401, JSON.stringify(bad));
    assert.equal(w.recorded.length, 0);
  }
  w = world();
  r = await handleBilling(await signedWebhook({ ...ev, type: "payment.failed" }), ENV, w.f);
  assert.equal(r.status, 200);
  assert.equal(w.recorded.length, 0);
  // Not our checkout (another product on the same Dodo account): acknowledged, nothing recorded
  w = world({ recordError: "order_not_found" });
  r = await handleBilling(await signedWebhook(ev), ENV, w.f);
  assert.equal(r.status, 200);
  // Database briefly down: 500 so Dodo retries
  w = world({ recordError: "connection reset" });
  r = await handleBilling(await signedWebhook(ev), ENV, w.f);
  assert.equal(r.status, 500);
  // Dodo says it's not settled yet: retry later
  w = world({ payment: { status: "processing" } });
  r = await handleBilling(await signedWebhook(ev), ENV, w.f);
  assert.equal(r.status, 500);
  assert.equal(w.recorded.length, 0);
});

test("not configured: everything answers 'not set up' without calling anyone", async () => {
  const w = world();
  for (const a of ["order", "verify", "webhook"]) {
    const r = await handleBilling(post(a, {}), { VITE_SUPABASE_URL: ENV.VITE_SUPABASE_URL }, w.f);
    assert.equal(r.status, 503);
  }
  assert.equal(w.calls.length, 0);
  assert.equal((await handleBilling(new Request("https://parchi.site/api/billing?action=order"), ENV, w.f)).status, 405);
});
