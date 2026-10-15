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
