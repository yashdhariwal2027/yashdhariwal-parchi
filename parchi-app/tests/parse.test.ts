import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_MODEL, extractJson, handleParse, maskPhones, normalizeOrder, resetFormatMemory, type ParsedOrder } from "../api/parse";

beforeEach(() => resetFormatMemory());
import { findPhones, findPin, formatPhone } from "../src/lib/parse/extract";
import { bestMatch, similarity, STRONG_MATCH, WEAK_MATCH } from "../src/lib/parse/match";
import type { Product } from "../src/lib/types";

const ENV = {
  GEMINI_API_KEY: "test-gemini-key",
  VITE_SUPABASE_URL: "https://proj.supabase.co",
  VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
};

const MESSAGE = `Hi! 2 kurtas chahiye, blue wala, M size.
Aur 1 white dupatta bhi.
Rohini Sharma, H-14, Sector 9, Rohini, Delhi 110085
98765 43210
COD chalega?`;

const AI_OUTPUT = {
  is_order: true,
  customer_name: "Rohini Sharma",
  address: "H-14, Sector 9, Rohini, Delhi 110085",
  city: "Delhi",
  state: "Delhi",
  pincode: "110085",
  customer_gstin: "",
  payment: "cod",
  items: [
    { product_id: "p-kurta", match_confidence: "high", text: "kurtas blue wala", quantity: 2, quantity_stated: true, size: "M", colour: "Blue", other_details: "" },
    { product_id: "p-dupatta", match_confidence: "high", text: "white dupatta", quantity: 1, quantity_stated: true, size: "", colour: "White", other_details: "" },
  ],
  notes: "",
};

function geminiOk(obj: unknown, fenced = false) {
  const text = fenced ? "```json\n" + JSON.stringify(obj) + "\n```" : JSON.stringify(obj);
  return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] }, finishReason: "STOP" }] }), { status: 200 });
}

interface Call {
  url: string;
  init: RequestInit;
}

function mockFetch(handlers: { quota?: () => Response; gemini?: (call: Call, n: number) => Response | Promise<Response> }) {
  const calls: Call[] = [];
  let geminiCalls = 0;
  const f = (async (url: string | URL, init: RequestInit = {}) => {
    const u = String(url);
    calls.push({ url: u, init });
    if (u.includes("/rest/v1/rpc/consume_parse_quota")) return handlers.quota ? handlers.quota() : new Response("149", { status: 200 });
    if (u.includes("generativelanguage.googleapis.com")) return handlers.gemini!({ url: u, init }, geminiCalls++);
    throw new Error("unexpected fetch " + u);
  }) as typeof fetch;
  return { f, calls, geminiCount: () => geminiCalls };
}

function req(body: unknown, opts: { method?: string; token?: string | null } = {}) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (opts.token !== null) headers.authorization = `Bearer ${opts.token ?? "user-jwt"}`;
  return new Request("https://app.example/api/parse", {
    method: opts.method ?? "POST",
    headers,
    body: opts.method === "GET" ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });
}

const CATALOGUE = [
  { id: "p-kurta", name: "Kurta", aliases: "blue kurta" },
  { id: "p-dupatta", name: "Dupatta" },
];
const noSleep = async () => {};

test("reads an order: checks the user and quota, calls Gemini with the key in a header, returns validated JSON", async () => {
  const m = mockFetch({ gemini: () => geminiOk(AI_OUTPUT) });
  const res = await handleParse(req({ message: MESSAGE, catalogue: CATALOGUE }), ENV, m.f, noSleep);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(body.remainingToday, 149);
  assert.equal(body.order.customerName, "Rohini Sharma");
  assert.equal(body.order.items.length, 2);
  assert.equal(body.order.items[0].productId, "p-kurta");
  assert.equal(body.order.payment, "cod");

  const [quota, gemini] = m.calls;
  assert.equal(quota.url, "https://proj.supabase.co/rest/v1/rpc/consume_parse_quota");
  const qh = quota.init.headers as Record<string, string>;
  assert.equal(qh.authorization, "Bearer user-jwt");
  assert.equal(qh.apikey, "sb_publishable_test");

  assert.ok(gemini.url.endsWith(`/v1beta/models/${DEFAULT_MODEL}:generateContent`));
  assert.ok(!gemini.url.includes("test-gemini-key"), "API key is not in the URL");
  assert.equal((gemini.init.headers as Record<string, string>)["x-goog-api-key"], "test-gemini-key");
  const sent = String(gemini.init.body);
  assert.ok(!sent.includes("98765") && !sent.includes("43210"), "phone number never reaches Gemini");
  assert.ok(sent.includes("[phone]"));
  assert.ok(sent.includes("id: p-kurta | Kurta | also called: blue kurta"));
  const parsed = JSON.parse(sent);
  assert.equal(parsed.generationConfig.responseMimeType, "application/json");
  assert.ok(parsed.generationConfig.responseJsonSchema);
  assert.equal(parsed.generationConfig.temperature, undefined);
  assert.deepEqual(parsed.generationConfig.thinkingConfig, { thinkingLevel: "low" }, "short thinking: reading an order is simple");
});

test("GEMINI_MODEL overrides the default model", async () => {
  const m = mockFetch({ gemini: () => geminiOk(AI_OUTPUT) });
  await handleParse(req({ message: MESSAGE, catalogue: [] }), { ...ENV, GEMINI_MODEL: "gemini-3.5-flash-lite" }, m.f, noSleep);
  assert.ok(m.calls[1].url.includes("/models/gemini-3.5-flash-lite:generateContent"));
});

test("refuses without sign-in, before spending anything", async () => {
  const m = mockFetch({ gemini: () => geminiOk(AI_OUTPUT) });
  const res = await handleParse(req({ message: MESSAGE }, { token: null }), ENV, m.f, noSleep);
  assert.equal(res.status, 401);
  assert.equal(m.calls.length, 0);
});

test("invalid or expired session is reported as signed out", async () => {
  const m = mockFetch({
    quota: () => new Response(JSON.stringify({ code: "PGRST301", message: "JWT expired" }), { status: 401 }),
    gemini: () => geminiOk(AI_OUTPUT),
  });
  const res = await handleParse(req({ message: MESSAGE }), ENV, m.f, noSleep);
  assert.equal(res.status, 401);
  assert.equal((await res.json()).error, "not_signed_in");
  assert.equal(m.geminiCount(), 0);
});

test("daily limit reached", async () => {
  const m = mockFetch({
    quota: () => new Response(JSON.stringify({ code: "P0001", message: "parse_quota_exceeded" }), { status: 400 }),
    gemini: () => geminiOk(AI_OUTPUT),
  });
  const res = await handleParse(req({ message: MESSAGE }), ENV, m.f, noSleep);
  assert.equal(res.status, 429);
  assert.equal((await res.json()).error, "quota_exceeded");
  assert.equal(m.geminiCount(), 0);
});

test("missing configuration is explained, not crashed", async () => {
  const m = mockFetch({ gemini: () => geminiOk(AI_OUTPUT) });
  const res = await handleParse(req({ message: MESSAGE }), { ...ENV, GEMINI_API_KEY: "" }, m.f, noSleep);
  assert.equal(res.status, 503);
  const body = await res.json();
  assert.equal(body.error, "not_configured");
  assert.match(body.message, /GEMINI_API_KEY/);
});

test("bad requests", async () => {
  const m = mockFetch({ gemini: () => geminiOk(AI_OUTPUT) });
  assert.equal((await handleParse(req(null, { method: "GET" }), ENV, m.f, noSleep)).status, 405);
  assert.equal((await handleParse(req({ message: "   " }), ENV, m.f, noSleep)).status, 400);
  assert.equal((await handleParse(req("{not json"), ENV, m.f, noSleep)).status, 400);
  const long = await handleParse(req({ message: "x".repeat(4001) }), ENV, m.f, noSleep);
  assert.equal(long.status, 400);
  assert.match((await long.json()).message, /too long/);
  assert.equal(m.calls.length, 0, "nothing is called for bad input");
});

test("retries without the schema field if this API version rejects it", async () => {
  const m = mockFetch({
    gemini: (_c, n) =>
      n === 0
        ? new Response(JSON.stringify({ error: { code: 400, message: 'Invalid JSON payload received. Unknown name "responseJsonSchema"' } }), { status: 400 })
        : geminiOk(AI_OUTPUT, true),
  });
  const res = await handleParse(req({ message: MESSAGE, catalogue: CATALOGUE }), ENV, m.f, noSleep);
  assert.equal(res.status, 200);
  const second = JSON.parse(String(m.calls[2].init.body));
  assert.equal(second.generationConfig.responseJsonSchema, undefined);
  assert.ok(second.generationConfig.responseSchema, "second try uses the older schema field");
});

// The exact reply seen in production on 15 Oct 2026.
const INVALID_ARGUMENT = JSON.stringify({ error: { code: 400, message: "Request contains an invalid argument.", status: "INVALID_ARGUMENT" } });

test("a bare 'invalid argument' 400 steps down through simpler formats until one works", async () => {
  for (const okAt of [1, 2, 3]) {
    resetFormatMemory();
    const m = mockFetch({ gemini: (_c, n) => (n < okAt ? new Response(INVALID_ARGUMENT, { status: 400 }) : geminiOk(AI_OUTPUT, okAt === 3)) });
    const res = await handleParse(req({ message: MESSAGE, catalogue: CATALOGUE }), ENV, m.f, noSleep);
    assert.equal(res.status, 200, `works when format #${okAt + 1} is accepted`);
    const body = await res.json();
    assert.equal(body.order.items.length, 2);
    assert.equal(m.geminiCount(), okAt + 1);
  }
  resetFormatMemory();
  const all = mockFetch({ gemini: () => new Response(INVALID_ARGUMENT, { status: 400 }) });
  const res = await handleParse(req({ message: MESSAGE, catalogue: CATALOGUE }), ENV, all.f, noSleep);
  assert.equal((await res.json()).error, "ai_failed");
  assert.equal(all.geminiCount(), 4, "stops after the simplest format");
  const bodies = all.calls.slice(1).map((c) => JSON.parse(String(c.init.body)));
  assert.ok(bodies[0].generationConfig.responseJsonSchema);
  assert.equal(bodies[1].generationConfig.responseSchema.type, "OBJECT");
  assert.equal(bodies[1].generationConfig.responseSchema.properties.items.items.properties.quantity.type, "NUMBER");
  assert.equal(bodies[1].generationConfig.responseSchema.properties.items.maxItems, undefined);
  assert.deepEqual(bodies[2].generationConfig, { responseMimeType: "application/json", thinkingConfig: { thinkingLevel: "low" } });
  assert.equal(bodies[3].generationConfig, undefined);
  for (const b of bodies.slice(2)) assert.match(b.systemInstruction.parts[0].text, /matching this schema/);
  for (const b of bodies) assert.ok(!JSON.stringify(b).includes("98765"), "phone still masked on every try");
});

test("busy retries and format step-downs don't use up each other's attempts", async () => {
  const seq = [503, 400, 429, 400];
  const m = mockFetch({ gemini: (_c, n) => (n < seq.length ? new Response(INVALID_ARGUMENT, { status: seq[n] }) : geminiOk(AI_OUTPUT)) });
  const res = await handleParse(req({ message: MESSAGE, catalogue: CATALOGUE }), ENV, m.f, noSleep);
  assert.equal(res.status, 200);
  assert.equal(m.geminiCount(), 5);
});

test("retries when Gemini is busy, then gives a clear message", async () => {
  const ok = mockFetch({ gemini: (_c, n) => (n === 0 ? new Response("{}", { status: 429 }) : geminiOk(AI_OUTPUT)) });
  assert.equal((await handleParse(req({ message: MESSAGE }), ENV, ok.f, noSleep)).status, 200);
  const busy = mockFetch({ gemini: () => new Response("{}", { status: 503 }) });
  const res = await handleParse(req({ message: MESSAGE }), ENV, busy.f, noSleep);
  assert.equal(res.status, 503);
  assert.equal((await res.json()).error, "ai_busy");
  assert.equal(busy.geminiCount(), 3);
});

test("bad API key and unknown model are reported as setup problems", async () => {
  const key = mockFetch({ gemini: () => new Response(JSON.stringify({ error: { message: "API key not valid. Please pass a valid API key." } }), { status: 400 }) });
  const r1 = await (await handleParse(req({ message: MESSAGE }), ENV, key.f, noSleep)).json();
  assert.equal(r1.error, "not_configured");
  assert.match(r1.message, /API key/);
  const model = mockFetch({ gemini: () => new Response("{}", { status: 404 }) });
  const r2 = await (await handleParse(req({ message: MESSAGE }), ENV, model.f, noSleep)).json();
  assert.match(r2.message, /GEMINI_MODEL/);
});

test("timeout and unreadable output", async () => {
  const slow = mockFetch({
    gemini: () => {
      const e = new Error("timed out");
      e.name = "TimeoutError";
      throw e;
    },
  });
  assert.equal((await handleParse(req({ message: MESSAGE }), ENV, slow.f, noSleep)).status, 504);
  const junk = mockFetch({ gemini: () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "Sorry, I can't" }] } }] })) });
  assert.equal((await (await handleParse(req({ message: MESSAGE }), ENV, junk.f, noSleep)).json()).error, "ai_failed");
  const blocked = mockFetch({ gemini: () => new Response(JSON.stringify({ promptFeedback: { blockReason: "SAFETY" } })) });
  assert.equal((await (await handleParse(req({ message: MESSAGE }), ENV, blocked.f, noSleep)).json()).error, "ai_failed");
});

test("output validation: unknown product ids, silly quantities and junk fields are cleaned", () => {
  const o = normalizeOrder(
    {
      is_order: true,
      customer_name: "  Rohini   Sharma ",
      payment: "bitcoin",
      pincode: "1100",
      customer_gstin: "27aapfu0939f1zv",
      notes: "call 9876543210 before",
      items: [
        { product_id: "made-up", match_confidence: "high", text: "kurta", quantity: 2, quantity_stated: true },
        { product_id: "p-kurta", match_confidence: "none", text: "kurta", quantity: -3, quantity_stated: true },
        { product_id: "", text: "", quantity: 1 },
        { product_id: "p-dupatta", match_confidence: "medium", text: "dupatta", quantity: "3", quantity_stated: false },
      ],
    },
    new Set(["p-kurta", "p-dupatta"]),
  );
  assert.equal(o.customerName, "Rohini Sharma");
  assert.equal(o.payment, "unknown");
  assert.equal(o.pincode, "");
  assert.equal(o.customerGstin, "27AAPFU0939F1ZV");
  assert.equal(o.notes, "call [phone] before");
  assert.equal(o.items.length, 3, "empty item dropped");
  assert.deepEqual([o.items[0].productId, o.items[0].confidence], ["", "none"], "made-up id removed");
  assert.deepEqual([o.items[1].quantity, o.items[1].quantityStated, o.items[1].confidence], [1, false, "low"]);
  assert.deepEqual([o.items[2].quantity, o.items[2].quantityStated], [3, false]);
  assert.equal(normalizeOrder(null, new Set()).items.length, 0);
});

test("extractJson handles fences and surrounding text", () => {
  assert.deepEqual(extractJson('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(extractJson('Here you go: {"a":2} thanks'), { a: 2 });
  assert.throws(() => extractJson("nothing"));
});

test("phone numbers: found on the device, masked for the AI, the same ones either way", () => {
  const samples = [
    "98765 43210",
    "+91 98765-43210",
    "+91-9876543210",
    "09876543210",
    "919876543210",
    "98-7654-3210",
    "(+91) 98765 43210",
  ];
  for (const s of samples) {
    assert.deepEqual(findPhones(`call ${s} pls`), ["9876543210"], s);
    assert.equal(maskPhones(`call ${s} pls`), "call [phone] pls", s);
  }
  assert.deepEqual(findPhones("9876543210 or 9123456789, again 9876543210"), ["9876543210", "9123456789"]);
  // Phone on the same line as the PIN code
  assert.deepEqual(findPhones("Rohini, Delhi 110085 98765 43210"), ["9876543210"]);
  assert.equal(maskPhones("Rohini, Delhi 110085 98765 43210"), "Rohini, Delhi 110085 [phone]");
  assert.equal(findPin("Rohini, Delhi 110085 98765 43210"), "110085");
  assert.deepEqual(findPhones("0091 98765 43210"), ["9876543210"]);
  assert.equal(maskPhones("2 kurtas, size 42, ₹1,299 each, PIN 560001"), "2 kurtas, size 42, ₹1,299 each, PIN 560001", "sizes, prices and PINs untouched");
  assert.deepEqual(findPhones("Order #1234567890 total 2598"), [], "10 digits starting with 1 is not a mobile");
  assert.equal(maskPhones("PIN 110085, ₹1,299"), "PIN 110085, ₹1,299");
  assert.equal(formatPhone("9876543210"), "+91 98765 43210");
});

test("PIN codes", () => {
  assert.equal(findPin("Rohini, Delhi 110085"), "110085");
  assert.equal(findPin("Delhi 110 085"), "110085");
  assert.equal(findPin("call 9876543210, no pin"), null);
  assert.equal(findPin("₹125000 total"), null);
  assert.equal(findPin(MESSAGE), "110085");
});

const P = (id: string, name: string, aliases = ""): Product => ({
  id,
  name,
  aliases,
  price: 100,
  unit: "PCS",
  hsn: "6204",
  gst_rate: 5,
  rate_rule: "fixed",
  archived: false,
});

test("matching customer words to products", () => {
  const products = [P("k", "Kurta"), P("ks", "Kurta Set"), P("d", "Dupatta"), P("c", "Chocolate Truffle Cake", "truffle cake"), P("r", "Silver Ring")];
  const best = (t: string) => bestMatch(t, products);
  assert.equal(best("blue wala kurta")?.product.id, "k");
  assert.ok(best("kurtas")!.score >= STRONG_MATCH);
  assert.equal(best("2 kurte")?.product.id, "k");
  assert.equal(best("white dupatta")?.product.id, "d");
  assert.equal(best("kurta set")?.product.id, "ks");
  assert.equal(best("chocolate cake 1kg")?.product.id, "c");
  assert.ok(best("chocolate cake 1kg")!.score >= WEAK_MATCH);
  assert.equal(best("truffle cake")?.product.id, "c");
  assert.equal(best("silver rings")?.product.id, "r");
  assert.ok(best("cushion cover")!.score < WEAK_MATCH);
  assert.ok(similarity("", "Kurta") === 0);
  assert.equal(bestMatch("kurta", []), null);
  assert.equal(bestMatch("kurta", [{ ...P("x", "Kurta"), archived: true }]), null, "archived products are ignored");
});

export type { ParsedOrder };

test("instructions: item details, notes and payment are tightly defined (15 Oct 2026 fixes)", async () => {
  const { SYSTEM_PROMPT } = await import("../api/parse");
  assert.match(SYSTEM_PROMPT, /other_details: only further attributes of the product itself/);
  assert.match(SYSTEM_PROMPT, /Never who it is for/);
  assert.match(SYSTEM_PROMPT, /without the colour, size or quantity/);
  assert.match(SYSTEM_PROMPT, /printed on the customer's invoice, so leave out requests for discounts/);
  assert.match(SYSTEM_PROMPT, /"GPay se advance kar dungi" is "upi"/);
  assert.match(SYSTEM_PROMPT, /"prepaid" only if they say they have already paid/);
  assert.match(SYSTEM_PROMPT, /bill in a company's name or give a GSTIN, use the company's name/);
});

test("a format Gemini refused isn't tried again on the next order (warm server)", async () => {
  const m = mockFetch({ gemini: (c) => (JSON.parse(String(c.init.body)).generationConfig?.responseJsonSchema || JSON.parse(String(c.init.body)).generationConfig?.responseSchema ? new Response(INVALID_ARGUMENT, { status: 400 }) : geminiOk(AI_OUTPUT)) });
  assert.equal((await handleParse(req({ message: MESSAGE, catalogue: CATALOGUE }), ENV, m.f, noSleep)).status, 200);
  assert.equal(m.geminiCount(), 3, "first order: two refusals, then json_mime");
  assert.equal((await handleParse(req({ message: MESSAGE, catalogue: CATALOGUE }), ENV, m.f, noSleep)).status, 200);
  assert.equal(m.geminiCount(), 4, "second order: straight to the format that worked");
  const last = JSON.parse(String(m.calls.at(-1)!.init.body));
  assert.deepEqual(last.generationConfig, { responseMimeType: "application/json", thinkingConfig: { thinkingLevel: "low" } });
});

test("time limits: each call gets what's left of the budget, and a slow Gemini gives a clear message", async () => {
  const timeouts: number[] = [];
  const realTimeout = AbortSignal.timeout;
  (AbortSignal as unknown as { timeout: (ms: number) => AbortSignal }).timeout = (ms: number) => {
    timeouts.push(ms);
    return realTimeout.call(AbortSignal, ms);
  };
  try {
    const m = mockFetch({ gemini: () => geminiOk(AI_OUTPUT) });
    await handleParse(req({ message: MESSAGE }), ENV, m.f, noSleep);
    assert.ok(timeouts[0] > 30_000 && timeouts[0] <= 45_000, `first call may take up to 45 s (got ${timeouts[0]})`);
  } finally {
    (AbortSignal as unknown as { timeout: typeof realTimeout }).timeout = realTimeout;
  }
  const slow = mockFetch({
    gemini: () => {
      const e = new Error("timed out");
      e.name = "TimeoutError";
      throw e;
    },
  });
  const r = await handleParse(req({ message: MESSAGE }), ENV, slow.f, noSleep);
  assert.equal(r.status, 504);
  assert.equal(slow.geminiCount(), 1, "no second slow try that would run past Vercel's limit");
});

const QUOTA_429 = (secs: string) =>
  JSON.stringify({
    error: {
      code: 429,
      message: `You exceeded your current quota, please check your plan and billing details. Please retry in ${secs}s.`,
      status: "RESOURCE_EXHAUSTED",
      details: [{ "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: `${Math.floor(Number(secs))}s` }],
    },
  });

test("usage limit (429 quota): no pointless retries, and an honest message", async () => {
  const slept: number[] = [];
  const sleep = async (ms: number) => void slept.push(ms);
  const m = mockFetch({ gemini: () => new Response(QUOTA_429("52.3"), { status: 429 }) });
  const res = await handleParse(req({ message: MESSAGE }), ENV, m.f, sleep);
  const body = await res.json();
  assert.equal(body.error, "ai_limit");
  assert.match(body.message, /usage limit/);
  assert.equal(m.geminiCount(), 1, "stops after the first 'quota exceeded'");
  assert.deepEqual(slept, []);

  // Google says "retry in 2s" (a per-minute limit about to reset): wait that long once, then it works.
  slept.length = 0;
  const brief = mockFetch({ gemini: (_c, n) => (n === 0 ? new Response(QUOTA_429("2.1"), { status: 429 }) : geminiOk(AI_OUTPUT)) });
  assert.equal((await handleParse(req({ message: MESSAGE }), ENV, brief.f, sleep)).status, 200);
  assert.deepEqual(slept, [2100]);

  // Overloaded (503 "high demand"): waits longer each time, then a clear "busy".
  slept.length = 0;
  const busy = mockFetch({ gemini: () => new Response(JSON.stringify({ error: { code: 503, message: "This model is currently experiencing high demand." } }), { status: 503 }) });
  assert.equal((await (await handleParse(req({ message: MESSAGE }), ENV, busy.f, sleep)).json()).error, "ai_busy");
  assert.deepEqual(slept, [1500, 3000]);

  const { retryAfterSeconds } = await import("../api/parse");
  assert.equal(retryAfterSeconds("", new Headers({ "retry-after": "7" })), 7);
  assert.equal(retryAfterSeconds('{"retryDelay": "45s"}'), 45);
  assert.equal(retryAfterSeconds("nothing here"), null);
});

test("plans: no pass, or reads used up, is explained before Gemini is called", async () => {
  for (const [dbError, code] of [["plan_required", "plan_required"], ["plan_read_limit", "plan_limit"]] as const) {
    const m = mockFetch({ quota: () => new Response(JSON.stringify({ code: "P0001", message: dbError }), { status: 400 }), gemini: () => geminiOk(AI_OUTPUT) });
    const res = await handleParse(req({ message: MESSAGE }), ENV, m.f, noSleep);
    assert.equal(res.status, 402);
    const body = await res.json();
    assert.equal(body.error, code);
    assert.match(body.message, /plan/i);
    assert.equal(m.geminiCount(), 0);
  }
});
