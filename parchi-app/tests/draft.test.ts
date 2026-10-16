import { test } from "node:test";
import assert from "node:assert/strict";
import type { ParsedOrder } from "../api/parse";
import { gstinCheckChar } from "../src/lib/gst/gstin";
import { calcDraft, checkDraft, draftFromParsed, draftToRow, emptyDraft, lineFromProduct, rowToDraft } from "../src/lib/invoice/draft";
import type { Business, Draft, InvoiceRow, Product } from "../src/lib/types";

const biz = (o: Partial<Business> = {}): Business => ({
  user_id: "u1",
  name: "Noor Studio",
  legal_name: null,
  address: "Lajpat Nagar, New Delhi",
  state_code: "07",
  pincode: "110024",
  phone: null,
  email: null,
  gst_status: "regular",
  gstin: null,
  prices_include_gst: true,
  invoice_prefix: "INV",
  upi_id: null,
  logo: null,
  signature: null,
  terms: null,
  ...o,
});

const products: Product[] = [
  { id: "p-kurta", name: "Kurta", aliases: "", price: 1299, unit: "PCS", hsn: "6204", gst_rate: 5, rate_rule: "apparel_2500", archived: false },
  { id: "p-dupatta", name: "Dupatta", aliases: "chunni", price: 599, unit: "PCS", hsn: "6214", gst_rate: 5, rate_rule: "apparel_2500", archived: false },
];

const MESSAGE = `Hi! 2 kurtas chahiye, blue wala, M size.
Aur 1 white dupatta bhi.
Rohini Sharma, H-14, Sector 9, Rohini, Delhi 110085
98765 43210
COD chalega?`;

const order = (o: Partial<ParsedOrder> = {}): ParsedOrder => ({
  isOrder: true,
  customerName: "Rohini Sharma",
  address: "H-14, Sector 9, Rohini, Delhi",
  city: "Delhi",
  state: "Delhi",
  pincode: "110085",
  customerGstin: "",
  payment: "cod",
  items: [
    { productId: "p-kurta", confidence: "high", text: "kurtas blue wala", quantity: 2, quantityStated: true, size: "M", colour: "Blue", details: "" },
    { productId: "p-dupatta", confidence: "high", text: "white dupatta", quantity: 1, quantityStated: true, size: "", colour: "White", details: "" },
  ],
  notes: "",
  ...o,
});

test("a clean read becomes a ready draft with no checks", () => {
  const d = draftFromParsed(order(), MESSAGE, products);
  assert.equal(d.customerName, "Rohini Sharma");
  assert.equal(d.customerPhone, "+91 98765 43210", "phone read on the device");
  assert.equal(d.customerAddress, "H-14, Sector 9, Rohini, Delhi, 110085", "PIN added to the address");
  assert.equal(d.customerStateCode, "07");
  assert.equal(d.placeOfSupply, "07");
  assert.equal(d.paymentMode, "cod");
  assert.deepEqual(
    d.lines.map((l) => [l.name, l.variant, l.qty, l.price, l.hsn, l.rateRule]),
    [
      ["Kurta", "Blue, M", 2, 1299, "6204", "apparel_2500"],
      ["Dupatta", "White", 1, 599, "6214", "apparel_2500"],
    ],
  );
  assert.equal(d.checks.length + d.lines.flatMap((l) => l.checks).length, 0);
});

test("uncertain reads get Check flags", () => {
  const d = draftFromParsed(
    order({
      customerName: "",
      state: "",
      city: "",
      items: [
        { productId: "p-kurta", confidence: "medium", text: "that top", quantity: 1, quantityStated: false, size: "", colour: "", details: "" },
        { productId: "", confidence: "none", text: "chunni", quantity: 1, quantityStated: true, size: "", colour: "", details: "" },
        { productId: "", confidence: "none", text: "silk scarf", quantity: 3, quantityStated: true, size: "", colour: "", details: "" },
      ],
    }),
    "that top and chunni and 3 silk scarf, call 9876543210 or 9123456789",
    products,
  );
  const fields = (i: number) => d.lines[i].checks.map((c) => c.field).sort();
  assert.deepEqual(fields(0), ["product", "qty"], "medium confidence + quantity not stated");
  assert.equal(d.lines[1].productId, "p-dupatta", "alias 'chunni' matched on the device");
  assert.deepEqual(fields(1), ["product"]);
  assert.equal(d.lines[2].productId, null);
  assert.equal(d.lines[2].name, "Silk scarf");
  assert.equal(d.lines[2].price, 0);
  assert.deepEqual(fields(2), ["price"]);
  const top = d.checks.map((c) => c.field).sort();
  assert.ok(top.includes("customerName"));
  assert.ok(top.includes("customerPhone"), "two phone numbers");
  assert.ok(top.includes("customerState"), "state guessed from PIN");
  assert.equal(d.customerStateCode, "07", "PIN 110085 suggests Delhi");
});

test("state from AI disagreeing with the PIN is flagged", () => {
  const d = draftFromParsed(order({ state: "Haryana" }), MESSAGE, products);
  assert.equal(d.customerStateCode, "06");
  assert.match(d.checks.find((c) => c.field === "customerState")!.reason, /Delhi/);
});

test("customer GSTIN sets the place of supply (bill-to / ship-to)", () => {
  const d = draftFromParsed(order({ customerGstin: "27AAPFU0939F1ZV" }), MESSAGE, products);
  assert.equal(d.customerGstin, "27AAPFU0939F1ZV");
  assert.equal(d.customerStateCode, "07");
  assert.equal(d.placeOfSupply, "27");
  const bad = draftFromParsed(order({ customerGstin: "27AAPFU0939F1ZW" }), MESSAGE, products);
  assert.ok(bad.checks.some((c) => c.field === "customerGstin"));
});

// A valid Delhi GSTIN for the seller (same PAN as the published example 27AAPFU0939F1ZV).
const SELLER_GSTIN = "07AAPFU0939F1Z" + gstinCheckChar("07AAPFU0939F1Z");
const B = biz({ gstin: SELLER_GSTIN });

function ready(): Draft {
  return draftFromParsed(order(), MESSAGE, products);
}

const codes = (d: Draft, b: Business) => checkDraft(d, b, calcDraft(d, b), "2026-10-15").map((i) => `${i.level}:${i.code}`);

test("a ready draft has nothing blocking it", () => {
  assert.deepEqual(codes(ready(), B), []);
});

test("blocking problems", () => {
  const d = ready();
  d.customerName = "";
  d.lines[0].hsn = "";
  d.lines[1].qty = 0;
  d.placeOfSupply = null;
  d.issueDate = "2026-10-16";
  d.lines[0].checks.push({ field: "qty", reason: "x" });
  const c = codes(d, B);
  for (const want of ["block:customer_name", "block:item_hsn", "block:item_qty", "block:pos", "block:future_date", "block:checks"]) {
    assert.ok(c.includes(want), want);
  }
  assert.deepEqual(codes({ ...emptyDraft(), customerName: "X", placeOfSupply: "07", issueDate: "2026-10-15" }, B), ["block:no_items"]);
});

test("HSN isn't needed on a plain invoice from an unregistered seller", () => {
  const d = ready();
  d.lines.forEach((l) => (l.hsn = ""));
  const U = biz({ gst_status: "unregistered", gstin: null });
  assert.deepEqual(codes(d, U), []);
  assert.ok(codes(d, biz({ gst_status: "composition" })).includes("block:item_hsn"), "bill of supply needs HSN");
});

test("inter-state sales by unregistered or composition sellers are flagged", () => {
  const d = ready();
  d.customerStateCode = "27";
  d.placeOfSupply = "27";
  assert.deepEqual(codes(d, biz({ gst_status: "unregistered", gstin: null })), ["warn:interstate_unregistered"]);
  assert.deepEqual(codes(d, biz({ gst_status: "composition" })), ["warn:interstate_unregistered"]);
  assert.deepEqual(codes(d, B), [], "fine for a regular seller (IGST)");
});

test("Rule 46: ₹50,000+ to an unregistered buyer needs address and state; e-way bill reminder", () => {
  const d = ready();
  d.lines = [{ ...lineFromProduct(products[0], 50), price: 1299 }];
  d.customerAddress = "";
  d.customerStateCode = null;
  const c = codes(d, B);
  assert.ok(c.includes("block:address_50k"));
  assert.ok(c.includes("block:state_50k"));
  assert.ok(c.includes("warn:eway"));
});

test("GSTIN and delivery in different states gives a place-of-supply note", () => {
  const d = ready();
  d.customerGstin = "27AAPFU0939F1ZV";
  d.placeOfSupply = "27";
  assert.deepEqual(codes(d, B), ["warn:bill_to_ship_to"]);
  d.customerGstin = "27AAPFU0939F1ZW";
  assert.ok(codes(d, B).includes("block:customer_gstin"));
});

test("saving and reopening a draft keeps everything; stored totals match the calculation", () => {
  const d = ready();
  d.delivery = 99;
  d.notes = "Gift wrap";
  const row = draftToRow(d, B);
  assert.equal(row.doc_type, "tax_invoice");
  assert.equal(row.grand_total, 3296);
  assert.equal(row.totals.title, "Tax Invoice");
  assert.equal((row.totals as { amount_in_words: string }).amount_in_words, "Indian Rupees Three Thousand Two Hundred Ninety Six Only");
  assert.equal(row.lines[0].rate, 5);
  assert.equal(row.lines[0].taxable_p, 247428);
  assert.equal(row.customer_gstin, null);
  const back = rowToDraft({ ...(row as unknown as InvoiceRow), id: "inv1", status: "draft" } as InvoiceRow);
  assert.equal(back.id, "inv1");
  assert.deepEqual(
    back.lines.map((l) => [l.productId, l.name, l.variant, l.qty, l.price, l.hsn, l.gstRate, l.rateRule]),
    d.lines.map((l) => [l.productId, l.name, l.variant, l.qty, l.price, l.hsn, l.gstRate, l.rateRule]),
  );
  assert.equal(back.delivery, 99);
  assert.equal(back.notes, "Gift wrap");
  assert.equal(draftToRow(back, B).grand_total, 3296);
  assert.equal(draftToRow(d, biz({ gst_status: "composition" })).doc_type, "bill_of_supply");
  assert.equal(draftToRow(d, biz({ gst_status: "unregistered", gstin: null })).doc_type, "invoice");
});

// ---------------------------------------------------------------------------------------------
// 15 Oct 2026 update: what Gemini actually returned for the Priya Nair test message
// ---------------------------------------------------------------------------------------------

const PRIYA_MESSAGE = `hello didi 🙏
pink kurti chahiye L size mein, 2 piece... nahi nahi 3 kar do, meri sister ke liye bhi
saath mein matching dupatta bhi bhej dena
aur ek black tshirt XL, mere husband ke liye
Priya Nair
Flat 302, Green Glen Layout, Bellandur, near Central Mall, Bangalore 560103
+91-98111 22334
GPay se advance kar dungi. total 4000 kar do na please 😅
Saturday tak pahunch jana chahiye, gift wrap karna`;

const priyaOrder = (): ParsedOrder =>
  order({
    customerName: "Priya Nair",
    address: "Flat 302, Green Glen Layout, Bellandur, near Central Mall, Bangalore 560103",
    city: "Bangalore",
    state: "Karnataka",
    pincode: "560103",
    payment: "prepaid",
    notes: "total 4000 kar do na please, Saturday tak pahunch jana chahiye, gift wrap karna",
    items: [
      { productId: "p-kurta", confidence: "high", text: "pink kurti", quantity: 3, quantityStated: true, size: "L", colour: "pink", details: "" },
      { productId: "p-dupatta", confidence: "high", text: "matching dupatta", quantity: 1, quantityStated: false, size: "", colour: "", details: "matching" },
      { productId: "", confidence: "none", text: "black tshirt", quantity: 1, quantityStated: true, size: "XL", colour: "black", details: "mere husband ke liye" },
    ],
  });

test("item names don't repeat the colour, and 'who it's for' isn't printed as a product detail", async () => {
  const { nameAndVariant } = await import("../src/lib/invoice/draft");
  const d = draftFromParsed(priyaOrder(), PRIYA_MESSAGE, products);
  assert.deepEqual(
    d.lines.map((l) => [l.name, l.variant]),
    [
      ["Kurta", "pink, L"],
      ["Dupatta", "matching"],
      ["Tshirt", "black, XL"],
    ],
  );
  assert.deepEqual(nameAndVariant("blue kurta", "Blue", "M", "for my sister"), { name: "Kurta", variant: "Blue, M" });
  assert.deepEqual(nameAndVariant("cotton saree", "red", "", "pure cotton"), { name: "Cotton saree", variant: "red, pure cotton" });
  assert.deepEqual(nameAndVariant("XL", "", "XL", ""), { name: "XL", variant: "" }, "never strips the whole name");
  assert.deepEqual(nameAndVariant("Mug", "", "", "engrave: Riya ke liye"), { name: "Mug", variant: "" }, "cautious: drops it rather than print a note");
  assert.deepEqual(nameAndVariant("kurta", "blue", "M", "", "Kurta"), { name: "Kurta", variant: "blue, M" });
  assert.deepEqual(nameAndVariant("kurta", "Blue", "M", "blue", "Blue Kurta"), { name: "Blue Kurta", variant: "M" }, "no word repeated from the product name");
});

test("an item that isn't in the products has no GST rate until the seller picks one", async () => {
  const { rateMissing, titleFor } = await import("../src/lib/invoice/draft");
  const d = draftFromParsed(priyaOrder(), PRIYA_MESSAGE, products);
  const tshirt = d.lines[2];
  assert.equal(rateMissing(tshirt), true);
  assert.equal(rateMissing(d.lines[0]), false);
  assert.match(tshirt.checks.map((c) => c.reason).join(), /price, HSN and GST rate/);

  // Seller fills price and HSN but forgets the rate: can't issue.
  const filled: Draft = { ...d, checks: [], lines: d.lines.map((l, i) => ({ ...l, checks: [], ...(i === 2 ? { price: 499, hsn: "6109" } : {}) })) };
  const issues = checkDraft(filled, biz(), calcDraft(filled, biz()));
  assert.ok(issues.some((i) => i.level === "block" && i.code === "item_rate" && /Item 3: choose the GST rate/.test(i.message)));
  // ...and the draft isn't titled "Invoice-cum-Bill of Supply" because of the 0% placeholder.
  assert.equal(titleFor(filled, biz(), calcDraft(filled, biz())), "Tax Invoice");

  // Picks 5%: nothing blocks, totals as worked out earlier (Delhi seller, Karnataka buyer, IGST).
  const chosen: Draft = { ...filled, lines: filled.lines.map((l, i) => (i === 2 ? { ...l, rateRule: "fixed" as const, gstRate: 5, rateSet: true } : l)) };
  const c = calcDraft(chosen, biz());
  assert.deepEqual(checkDraft(chosen, biz(), c).filter((i) => i.level === "block"), []);
  assert.equal(c.intraState, false);
  assert.deepEqual([c.taxable, c.igst, c.cgst, c.grandTotal], [475715, 23785, 0, 499500]);

  // Composition and unregistered sellers don't charge GST, so there's nothing to choose.
  for (const gst_status of ["composition", "unregistered"] as const) {
    const b = biz({ gst_status });
    assert.ok(!checkDraft(filled, b, calcDraft(filled, b)).some((i) => i.code === "item_rate"));
  }

  // A hand-added line starts without a rate too.
  const { blankLine } = await import("../src/lib/invoice/draft");
  assert.equal(rateMissing(blankLine()), true);
});

test("the unchosen rate and the 'save to products' tick survive saving and reopening a draft", async () => {
  const d = draftFromParsed(priyaOrder(), PRIYA_MESSAGE, products);
  d.lines[2].saveAsProduct = true;
  const row = { ...draftToRow(d, biz()), id: "x" } as unknown as InvoiceRow;
  assert.equal(row.lines[2].rate_set, false);
  assert.equal(row.lines[2].save_product, true);
  assert.equal("rate_set" in row.lines[0], false, "nothing extra stored on normal lines");
  const back = rowToDraft(row);
  assert.equal(back.lines[2].rateSet, false);
  assert.equal(back.lines[2].saveAsProduct, true);
  assert.equal(back.lines[0].rateSet, true);
  // Older drafts (stored before this field existed) count as chosen.
  const old = { ...row, lines: row.lines.map(({ rate_set: _r, save_product: _s, ...l }) => l) } as unknown as InvoiceRow;
  assert.equal(rowToDraft(old).lines[2].rateSet, true);
});

test("Save to my products: only when complete, never a duplicate name", async () => {
  const { productFromLine, productNamed, readyToSaveAsProduct } = await import("../src/lib/invoice/draft");
  const d = draftFromParsed(priyaOrder(), PRIYA_MESSAGE, products);
  const t = { ...d.lines[2], saveAsProduct: true };
  assert.equal(readyToSaveAsProduct(t, biz()), false, "no price yet");
  assert.equal(readyToSaveAsProduct({ ...t, price: 499 }, biz()), false, "no HSN yet");
  assert.equal(readyToSaveAsProduct({ ...t, price: 499, hsn: "6109" }, biz()), false, "no GST rate yet");
  const done = { ...t, price: 499, hsn: "6109", rateRule: "apparel_2500" as const, rateSet: true };
  assert.equal(readyToSaveAsProduct(done, biz()), true);
  assert.equal(readyToSaveAsProduct({ ...done, saveAsProduct: false }, biz()), false, "only when ticked");
  assert.equal(readyToSaveAsProduct({ ...t, price: 499 }, biz({ gst_status: "unregistered" })), true, "unregistered sellers need only a price");
  assert.deepEqual(productFromLine(done), {
    name: "Tshirt",
    aliases: "",
    price: 499,
    unit: "PCS",
    hsn: "6109",
    gst_rate: 5,
    rate_rule: "apparel_2500",
    archived: false,
  });
  assert.equal(productNamed("  kurta ", products)?.id, "p-kurta");
  assert.equal(productNamed("Tshirt", products), undefined);
  assert.equal(productNamed("Kurta", [{ ...products[0], archived: true }]), undefined);

  // Ticked but no price: blocks issuing with a clear message (untick to issue without saving).
  const blocked: Draft = { ...d, checks: [], lines: d.lines.map((l, i) => ({ ...l, checks: [], ...(i === 2 ? { saveAsProduct: true, hsn: "6109", rateSet: true, gstRate: 5 } : {}) })) };
  const issues = checkDraft(blocked, biz(), calcDraft(blocked, biz()));
  assert.ok(issues.some((i) => i.code === "item_save_price" && /untick/.test(i.message)));
});

test("seller address in another state than the GST state is flagged", async () => {
  const { stateHintFromAddress } = await import("../src/lib/gst/states");
  assert.equal(stateHintFromAddress("10, 1st Cross Street, Udyog Vihar, Gurgaon")?.state.name, "Haryana");
  assert.equal(stateHintFromAddress("Plot 4, Sector 18", "122015")?.state.name, "Haryana", "PIN code field");
  assert.equal(stateHintFromAddress("Shop 2, MG Road, Bangalore 560001")?.state.name, "Karnataka", "PIN inside the address");
  assert.equal(stateHintFromAddress("Lajpat Nagar, New Delhi", "110024")?.state.name, "Delhi");
  assert.equal(stateHintFromAddress("Sector 62, Noida, near Delhi border"), undefined, "two states named: unclear, so no warning");
  assert.equal(stateHintFromAddress("Shop 5, Upper Bazaar"), undefined, "'up' inside words isn't Uttar Pradesh");
  assert.equal(stateHintFromAddress(""), undefined);

  const ready = draftFromParsed(order(), MESSAGE, products);
  const gurgaonSeller = biz({ address: "10, 1st Cross Street, Udyog Vihar, Gurgaon", pincode: null, state_code: "07" });
  const w = checkDraft(ready, gurgaonSeller, calcDraft(ready, gurgaonSeller)).find((i) => i.code === "seller_state");
  assert.equal(w?.level, "warn");
  assert.match(w!.message, /Gurgaon \(Haryana\).*Delhi/);
  assert.ok(!checkDraft(ready, biz(), calcDraft(ready, biz())).some((i) => i.code === "seller_state"), "matching address: no warning");
});

test("a lookalike never overrides the AI's 'not in your products' (silk saree is not Silk scarf)", () => {
  const withScarf: Product[] = [...products, { id: "p-scarf", name: "Silk scarf", aliases: "", price: 799, unit: "PCS", hsn: "6214", gst_rate: 5, rate_rule: "fixed", archived: false }];
  const saree = order({ items: [{ productId: "", confidence: "none", text: "Banarasi silk saree", quantity: 1, quantityStated: true, size: "", colour: "red", details: "" }] });
  const d = draftFromParsed(saree, MESSAGE, withScarf);
  assert.equal(d.lines[0].productId, null);
  assert.equal(d.lines[0].name, "Banarasi silk saree");
  assert.equal(d.lines[0].price, 0);
  // A near-exact spelling the AI missed is still picked up, and flagged.
  const typo = order({ items: [{ productId: "", confidence: "none", text: "dupata", quantity: 1, quantityStated: true, size: "", colour: "", details: "" }] });
  const d2 = draftFromParsed(typo, MESSAGE, withScarf);
  assert.equal(d2.lines[0].productId, "p-dupatta");
  assert.ok(d2.lines[0].checks.some((c) => c.field === "product"));
});
