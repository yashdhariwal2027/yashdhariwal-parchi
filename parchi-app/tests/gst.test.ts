import { test } from "node:test";
import assert from "node:assert/strict";
import { apparelRate, calculate, documentTitle, type CalcInput, type LineInput } from "../src/lib/gst/calc";
import { fyLabel, todayIST, formatDate } from "../src/lib/gst/dates";
import { gstinCheckChar, gstinProblem, isValidGstin, stateCodeOfGstin } from "../src/lib/gst/gstin";
import { divRound, formatPaise, toPaise } from "../src/lib/gst/money";
import { findState, stateFromPin } from "../src/lib/gst/states";
import { amountInWords, numberToIndianWords } from "../src/lib/gst/words";

const line = (o: Partial<LineInput>): LineInput => ({
  name: "Item",
  hsn: "6204",
  qty: 1,
  unit: "PCS",
  price: 0,
  discount: 0,
  gstRate: 5,
  rateRule: "fixed",
  ...o,
});

const noor = (o: Partial<CalcInput> = {}): CalcInput => ({
  gstStatus: "regular",
  pricesIncludeGst: true,
  sellerStateCode: "07",
  placeOfSupply: "07",
  delivery: 99,
  lines: [
    line({ name: "Kurta", qty: 2, price: 1299, rateRule: "apparel_2500" }),
    line({ name: "Dupatta", hsn: "6214", qty: 1, price: 599, rateRule: "apparel_2500" }),
  ],
  ...o,
});

test("money helpers round half up in paise", () => {
  assert.equal(toPaise(1.005), 101);
  assert.equal(toPaise(1299), 129900);
  assert.equal(toPaise(0.1 + 0.2), 30);
  assert.equal(divRound(5, 2), 3);
  assert.equal(divRound(4, 2), 2);
  assert.equal(divRound(-5, 2), -3);
  assert.equal(formatPaise(329600), "₹3,296.00");
  assert.equal(formatPaise(12345678900), "₹12,34,56,789.00");
  assert.equal(formatPaise(-200), "−₹2.00");
});

test("Noor Studio sample, Delhi to Delhi, GST-inclusive prices: CGST + SGST", () => {
  const r = calculate(noor());
  assert.equal(r.intraState, true);
  assert.equal(r.stateTaxLabel, "SGST");
  // Kurta: 2 x 1299 = 2598.00 incl. 5%. GST inside = 2598 - 2474.29 = 123.71, split 61.86 + 61.86,
  // so the taxable value is 2598.00 - 123.72 = 2474.28 and the line still totals 2598.00.
  assert.deepEqual(
    { rate: r.lines[0].rate, taxable: r.lines[0].taxable, cgst: r.lines[0].cgst, sgst: r.lines[0].sgst, igst: r.lines[0].igst, total: r.lines[0].total },
    { rate: 5, taxable: 247428, cgst: 6186, sgst: 6186, igst: 0, total: 259800 },
  );
  // CGST is still 2.5% of the taxable value, to the paisa: 2474.28 x 2.5% = 61.857
  assert.equal(Math.round(r.lines[0].taxable * 0.025), r.lines[0].cgst);
  // Dupatta: 599 incl. 5%; taxable 570.48; CGST = SGST = 14.26
  assert.deepEqual([r.lines[1].taxable, r.lines[1].cgst, r.lines[1].sgst], [57048, 1426, 1426]);
  // Delivery 99 incl. at the goods' rate (5%): GST inside 4.71 -> 2.36 + 2.36, taxable 94.28
  assert.deepEqual([r.delivery!.rate, r.delivery!.taxable, r.delivery!.cgst], [5, 9428, 236]);
  assert.equal(r.taxable, 313904);
  assert.equal(r.cgst, 7848);
  assert.equal(r.sgst, 7848);
  assert.equal(r.igst, 0);
  assert.equal(r.exact, 329600);
  assert.equal(r.roundOff, 0);
  assert.equal(r.grandTotal, 329600, "customer pays exactly the quoted ₹3,296");
});

test("Same order delivered to Maharashtra: IGST at the full rate", () => {
  const r = calculate(noor({ placeOfSupply: "27" }));
  assert.equal(r.intraState, false);
  assert.deepEqual(r.lines.map((l) => l.igst), [12371, 2852]);
  assert.equal(r.delivery!.igst, 471);
  assert.equal(r.cgst + r.sgst, 0);
  assert.equal(r.igst, 15694);
  assert.equal(r.exact, 329600);
  assert.equal(r.roundOff, 0);
  assert.equal(r.grandTotal, 329600);
});

test("place of supply not chosen yet", () => {
  const r = calculate(noor({ placeOfSupply: null }));
  assert.equal(r.intraState, null);
});

test("GST-exclusive prices add tax on top", () => {
  const r = calculate({
    gstStatus: "regular",
    pricesIncludeGst: false,
    sellerStateCode: "29",
    placeOfSupply: "29",
    delivery: 0,
    lines: [line({ name: "Silver ring", hsn: "7113", qty: 2, price: 1000, gstRate: 3 })],
  });
  assert.equal(r.taxable, 200000);
  assert.equal(r.cgst, 3000);
  assert.equal(r.sgst, 3000);
  assert.equal(r.grandTotal, 206000);
  assert.equal(r.delivery, null);
});

test("apparel rule: 5% up to ₹2,500 per piece, 18% above", () => {
  // Exclusive prices: the price is the value per piece
  assert.equal(apparelRate(250000, 1, false), 5);
  assert.equal(apparelRate(250001, 1, false), 18);
  // Inclusive: the value is the price backed out at 5%
  assert.equal(apparelRate(262500, 1, true), 5); // 2625 / 1.05 = 2500
  assert.equal(apparelRate(262600, 1, true), 18);
  // Per piece, not per line
  assert.equal(apparelRate(480000, 2, true), 5);
  // A ₹2,999 kurta (GST-inclusive) is taxed at 18%
  const r = calculate(noor({ delivery: 0, lines: [line({ price: 2999, rateRule: "apparel_2500" })] }));
  assert.equal(r.lines[0].rate, 18);
  assert.equal(r.lines[0].taxable, 254152);
  assert.equal(r.lines[0].cgst, 22874);
  assert.equal(r.grandTotal, 299900);
  // Discount brings it under the limit: 2,800 - 200 = 2,600 incl. -> 2,476 -> 5%
  const d = calculate(noor({ delivery: 0, lines: [line({ price: 2800, discount: 200, rateRule: "apparel_2500" })] }));
  assert.equal(d.lines[0].rate, 5);
  assert.equal(d.lines[0].gross, 260000);
});

test("delivery takes the highest GST rate among the goods, reported under that item's HSN", () => {
  const r = calculate({
    gstStatus: "regular",
    pricesIncludeGst: false,
    sellerStateCode: "27",
    placeOfSupply: "27",
    delivery: 100,
    lines: [
      line({ name: "Candle", hsn: "3406", price: 200, gstRate: 5 }),
      line({ name: "Perfume", hsn: "3303", price: 500, gstRate: 18 }),
    ],
  });
  assert.equal(r.delivery!.rate, 18);
  assert.equal(r.delivery!.cgst, 900);
  const perfume = r.summary.find((s) => s.hsn === "3303")!;
  assert.equal(perfume.taxable, 60000);
  assert.equal(perfume.cgst, 5400);
  assert.equal(r.summary.length, 2);
});

test("UTGST instead of SGST when the seller is in a Union Territory without a legislature", () => {
  const r = calculate(noor({ sellerStateCode: "04", placeOfSupply: "04" }));
  assert.equal(r.stateTaxLabel, "UTGST");
  assert.equal(calculate(noor({ sellerStateCode: "34", placeOfSupply: "34" })).stateTaxLabel, "SGST", "Puducherry has a legislature");
});

test("small rates (0.25%) are computed in paise without drift", () => {
  const r = calculate({
    gstStatus: "regular",
    pricesIncludeGst: false,
    sellerStateCode: "24",
    placeOfSupply: "24",
    delivery: 0,
    lines: [line({ hsn: "7102", price: 1000, gstRate: 0.25 })],
  });
  assert.equal(r.cgst, 125);
  assert.equal(r.sgst, 125);
  assert.equal(r.grandTotal, 100300); // 1002.50 -> 1003
  assert.equal(r.roundOff, 50);
});

test("composition and unregistered sellers charge no GST", () => {
  for (const status of ["composition", "unregistered"] as const) {
    const r = calculate(noor({ gstStatus: status }));
    assert.equal(r.chargesGst, false);
    assert.equal(r.tax, 0);
    assert.deepEqual(r.lines.map((l) => l.rate), [0, 0]);
    assert.equal(r.exact, 329600);
    assert.equal(r.grandTotal, 329600);
  }
  const paise = calculate(noor({ gstStatus: "unregistered", delivery: 0, lines: [line({ price: 99.5 })] }));
  assert.equal(paise.grandTotal, 10000);
  assert.equal(paise.roundOff, 50);
});

test("document titles", () => {
  assert.equal(documentTitle("regular", [5, 18], false), "Tax Invoice");
  assert.equal(documentTitle("regular", [5, 0], false), "Invoice-cum-Bill of Supply");
  assert.equal(documentTitle("regular", [5, 0], true), "Tax Invoice");
  assert.equal(documentTitle("regular", [0, 0], false), "Bill of Supply");
  assert.equal(documentTitle("composition", [0], false), "Bill of Supply");
  assert.equal(documentTitle("unregistered", [0], false), "Invoice");
});

test("amount in words, Indian numbering", () => {
  assert.equal(amountInWords(329600), "Indian Rupees Three Thousand Two Hundred Ninety Six Only");
  assert.equal(amountInWords(12345678900), "Indian Rupees Twelve Crore Thirty Four Lakh Fifty Six Thousand Seven Hundred Eighty Nine Only");
  assert.equal(amountInWords(10000000), "Indian Rupees One Lakh Only");
  assert.equal(amountInWords(5050), "Indian Rupees Fifty and Fifty Paise Only");
  assert.equal(amountInWords(0), "Indian Rupees Zero Only");
  assert.equal(numberToIndianWords(100000000), "Ten Crore");
  assert.equal(numberToIndianWords(1011), "One Thousand Eleven");
  assert.equal(numberToIndianWords(99999), "Ninety Nine Thousand Nine Hundred Ninety Nine");
});

test("financial year and India date", () => {
  assert.equal(fyLabel("2026-10-15"), "26-27");
  assert.equal(fyLabel("2026-04-01"), "26-27");
  assert.equal(fyLabel("2026-03-31"), "25-26");
  assert.equal(fyLabel("2000-01-05"), "99-00");
  assert.equal(todayIST(new Date("2026-10-14T19:00:00Z")), "2026-10-15");
  assert.equal(todayIST(new Date("2026-10-14T18:00:00Z")), "2026-10-14");
  assert.match(formatDate("2026-09-26"), /^26 Sep\w* 2026$/);
});

test("GSTIN validation", () => {
  assert.ok(isValidGstin("27AAPFU0939F1ZV"));
  assert.ok(isValidGstin("29AAGCB7383J1Z4"));
  assert.ok(isValidGstin(" 27aapfu0939f1zv "), "spaces and lowercase are fine");
  assert.equal(gstinProblem("27AAPFU0939F1ZW"), "checksum");
  assert.equal(gstinProblem("27AAPFU0939F1Z"), "length");
  assert.equal(gstinProblem("27AAPFUO939F1ZV"), "format", "letter O instead of zero");
  assert.equal(gstinProblem("99AAPFU0939F1ZV"), "state");
  assert.equal(gstinProblem(""), "empty");
  assert.equal(stateCodeOfGstin("27AAPFU0939F1ZV"), "27");
  assert.equal(stateCodeOfGstin("27AAPFU0939F1ZW"), null);
  // A generated GSTIN for another state
  const g = "07AAPFU0939F1Z";
  assert.ok(isValidGstin(g + gstinCheckChar(g)));
});

test("states from names, cities and PIN codes", () => {
  assert.equal(findState("Bangalore")?.code, "29");
  assert.equal(findState("New Delhi")?.code, "07");
  assert.equal(findState("U.P.")?.code, "09");
  assert.equal(findState("Pondicherry")?.code, "34");
  assert.equal(findState("tamil nadu")?.code, "33");
  assert.equal(findState("Jammu & Kashmir")?.code, "01");
  assert.equal(findState("Narnia"), undefined);
  const pins: [string, string][] = [
    ["110085", "07"], ["560001", "29"], ["403001", "30"], ["400001", "27"], ["122001", "06"], ["201301", "09"],
    ["248001", "05"], ["160017", "04"], ["744101", "35"], ["737101", "11"], ["500001", "36"], ["520001", "37"],
    ["834001", "20"], ["800001", "10"], ["700001", "19"], ["600001", "33"], ["682001", "32"], ["380001", "24"],
    ["302001", "08"], ["751001", "21"], ["781001", "18"], ["492001", "22"], ["452001", "23"], ["194101", "38"],
  ];
  for (const [pin, code] of pins) assert.equal(stateFromPin(pin)?.code, code, pin);
  assert.equal(stateFromPin("12345"), undefined);
  assert.equal(stateFromPin("012345"), undefined);
});
