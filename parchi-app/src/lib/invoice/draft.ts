import type { ParsedOrder } from "../../../api/parse";
import { calculate, docTypeFor, documentTitle, type CalcInput, type CalcResult } from "../gst/calc";
import { todayIST } from "../gst/dates";
import { gstinProblem, isValidGstin, normalizeGstin, stateCodeOfGstin } from "../gst/gstin";
import { formatPaise } from "../gst/money";
import { findState, stateByCode, stateFromPin } from "../gst/states";
import { amountInWords } from "../gst/words";
import { findPhones, findPin, formatPhone } from "../parse/extract";
import { bestMatch, STRONG_MATCH, WEAK_MATCH } from "../parse/match";
import type { Business, CheckFlag, Draft, DraftLine, InvoiceRow, PaymentMode, Product, StoredLine, StoredTotals } from "../types";

let keySeq = 0;
export const newKey = () => `l${Date.now().toString(36)}${(keySeq++).toString(36)}`;

export function emptyDraft(): Draft {
  return {
    id: null,
    issueDate: todayIST(),
    customerName: "",
    customerPhone: "",
    customerAddress: "",
    customerStateCode: null,
    customerGstin: "",
    placeOfSupply: null,
    lines: [],
    delivery: 0,
    paymentMode: "",
    notes: "",
    checks: [],
  };
}

export function blankLine(): DraftLine {
  return {
    key: newKey(),
    productId: null,
    name: "",
    variant: "",
    hsn: "",
    qty: 1,
    unit: "PCS",
    price: 0,
    discount: 0,
    gstRate: 0,
    rateRule: "fixed",
    checks: [],
  };
}

export function lineFromProduct(p: Product, qty = 1): DraftLine {
  return {
    ...blankLine(),
    productId: p.id,
    name: p.name,
    hsn: p.hsn ?? "",
    qty,
    unit: p.unit,
    price: Number(p.price),
    gstRate: Number(p.gst_rate),
    rateRule: p.rate_rule,
  };
}

const PAYMENT_FROM_AI: Record<ParsedOrder["payment"], PaymentMode> = {
  cod: "cod",
  upi: "upi",
  prepaid: "prepaid",
  bank: "bank",
  cash: "cash",
  unknown: "",
};

/** Turns what the AI read (plus what we read on the device) into an editable draft with "Check" flags. */
export function draftFromParsed(order: ParsedOrder, originalMessage: string, products: Product[]): Draft {
  const d = emptyDraft();
  const active = products.filter((p) => !p.archived);
  const byId = new Map(active.map((p) => [p.id, p]));

  d.customerName = order.customerName;
  if (!d.customerName) d.checks.push({ field: "customerName", reason: "Name not found in the message" });

  const phones = findPhones(originalMessage);
  if (phones.length) d.customerPhone = formatPhone(phones[0]);
  if (phones.length > 1) d.checks.push({ field: "customerPhone", reason: "More than one number in the message" });

  const pin = order.pincode || findPin(originalMessage) || "";
  let address = order.address;
  if (pin && address && !address.replace(/\s/g, "").includes(pin)) address = `${address}, ${pin}`;
  d.customerAddress = address;

  const gstin = normalizeGstin(order.customerGstin);
  if (gstin) {
    d.customerGstin = gstin;
    if (!isValidGstin(gstin)) d.checks.push({ field: "customerGstin", reason: "This GSTIN doesn't look right" });
  }

  // Delivery state: the AI's answer, else the PIN code, else the city. Always confirmed by the seller.
  const fromAi = findState(order.state) ?? findState(order.city);
  const fromPin = stateFromPin(pin);
  const state = fromAi ?? fromPin;
  d.customerStateCode = state?.code ?? null;
  if (!state) {
    if (address) d.checks.push({ field: "customerState", reason: "Choose the delivery state" });
  } else if (!fromAi) {
    d.checks.push({ field: "customerState", reason: "State guessed from the PIN code" });
  } else if (fromPin && fromPin.code !== fromAi.code) {
    d.checks.push({ field: "customerState", reason: `PIN code looks like ${fromPin.name}` });
  }
  d.placeOfSupply = defaultPlaceOfSupply(d.customerStateCode, d.customerGstin);

  d.paymentMode = PAYMENT_FROM_AI[order.payment];
  d.notes = order.notes;

  d.lines = order.items.map((item) => {
    const variant = [item.colour, item.size, item.details].filter(Boolean).join(", ");
    let product: Product | undefined = item.productId ? byId.get(item.productId) : undefined;
    const checks: CheckFlag[] = [];
    const local = bestMatch(item.text, active);

    if (product) {
      const agrees = local && local.product.id === product.id && local.score >= WEAK_MATCH;
      if (item.confidence !== "high" && !agrees) checks.push({ field: "product", reason: `Is "${item.text}" your ${product.name}?` });
    } else if (local && local.score >= STRONG_MATCH) {
      product = local.product;
      checks.push({ field: "product", reason: `Is "${item.text}" your ${product.name}?` });
    } else if (local && local.score >= WEAK_MATCH) {
      product = local.product;
      checks.push({ field: "product", reason: `Not sure "${item.text}" is ${product.name}` });
    }

    const line: DraftLine = product
      ? { ...lineFromProduct(product, item.quantity), variant }
      : { ...blankLine(), name: capitalise(item.text) || "Item", qty: item.quantity, variant };
    if (!product) checks.push({ field: "price", reason: "Not in your products. Enter the price" });
    if (!item.quantityStated) checks.push({ field: "qty", reason: "Quantity not mentioned" });
    line.checks = checks;
    return line;
  });

  return d;
}

function capitalise(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

/**
 * Place of supply for goods = where the delivery ends (IGST Act s.10(1)(a)).
 * For a registered buyer who asks for delivery elsewhere (bill-to / ship-to), it is the buyer's state (s.10(1)(b)),
 * so with a valid customer GSTIN we default to the GSTIN's state.
 */
export function defaultPlaceOfSupply(deliveryState: string | null, customerGstin: string): string | null {
  return stateCodeOfGstin(customerGstin) ?? deliveryState;
}

export function calcInput(d: Draft, b: Business): CalcInput {
  return {
    gstStatus: b.gst_status,
    pricesIncludeGst: b.prices_include_gst,
    sellerStateCode: b.state_code,
    placeOfSupply: d.placeOfSupply,
    delivery: d.delivery,
    lines: d.lines.map((l) => ({
      name: l.name,
      hsn: l.hsn,
      qty: l.qty,
      unit: l.unit,
      price: l.price,
      discount: l.discount,
      gstRate: l.gstRate,
      rateRule: l.rateRule,
    })),
  };
}

export function calcDraft(d: Draft, b: Business): CalcResult {
  return calculate(calcInput(d, b));
}

export function titleFor(d: Draft, b: Business, c: CalcResult): string {
  return documentTitle(b.gst_status, c.lines.map((l) => l.rate), isValidGstin(d.customerGstin));
}

// ---------------------------------------------------------------------------------------------
// Checks before issuing
// ---------------------------------------------------------------------------------------------

export interface Issue {
  /** block: can't issue. warn: allowed, but read this. */
  level: "block" | "warn";
  code: string;
  message: string;
  field?: string;
  lineKey?: string;
}

export function checkDraft(d: Draft, b: Business, c: CalcResult, today = todayIST()): Issue[] {
  const out: Issue[] = [];
  const block = (code: string, message: string, field?: string, lineKey?: string) => out.push({ level: "block", code, message, field, lineKey });
  const warn = (code: string, message: string, field?: string) => out.push({ level: "warn", code, message, field });
  const tax = b.gst_status === "regular";
  const needsHsn = b.gst_status !== "unregistered";

  if (!d.customerName.trim()) block("customer_name", "Add the customer's name.", "customerName");
  if (!d.lines.length) block("no_items", "Add at least one item.");
  if (d.issueDate > today) block("future_date", "The invoice date can't be in the future.", "issueDate");

  d.lines.forEach((l, i) => {
    const n = d.lines.length > 1 ? `Item ${i + 1}: ` : "";
    if (!l.name.trim()) block("item_name", `${n}add a description.`, "name", l.key);
    if (!(l.qty > 0)) block("item_qty", `${n}quantity must be more than 0.`, "qty", l.key);
    if (needsHsn && !/^\d{4}(\d{2}){0,2}$/.test(l.hsn)) {
      block("item_hsn", `${n}add the HSN code (4, 6 or 8 digits). It's required on GST invoices.`, "hsn", l.key);
    }
    if (l.price <= 0) warn("item_price", `${n}price is ₹0.`, "price");
    if (l.discount > l.qty * l.price) block("item_discount", `${n}discount is more than the item's value.`, "discount", l.key);
  });

  const unresolved = d.checks.length + d.lines.reduce((s, l) => s + l.checks.length, 0);
  if (unresolved) {
    block("checks", `Confirm the ${unresolved === 1 ? "highlighted detail" : `${unresolved} highlighted details`} first.`);
  }

  if (d.customerGstin) {
    const p = gstinProblem(d.customerGstin);
    if (p) block("customer_gstin", "The customer's GSTIN doesn't look right. Fix it or remove it.", "customerGstin");
  }

  if (tax) {
    if (!d.placeOfSupply) {
      block("pos", "Choose the place of supply (the delivery state). It decides CGST + SGST or IGST.", "placeOfSupply");
    }
    const gstinState = stateCodeOfGstin(d.customerGstin);
    if (gstinState && d.customerStateCode && gstinState !== d.customerStateCode) {
      warn(
        "bill_to_ship_to",
        `The customer's GSTIN is from ${stateByCode(gstinState)?.name} but delivery is to ${stateByCode(d.customerStateCode)?.name}. If they asked you to deliver to someone else, the place of supply is the customer's GSTIN state.`,
      );
    }
  }

  // Not registered / composition sellers generally can't sell goods to other states (CGST Act s.10(2)(c) and s.24).
  if (!tax && d.customerStateCode && d.customerStateCode !== b.state_code) {
    warn(
      "interstate_unregistered",
      b.gst_status === "composition"
        ? "Composition sellers can't make inter-state sales of goods. Check with your CA before sending goods to another state."
        : "Selling goods to another state usually needs GST registration. Check with your CA if you do this regularly.",
    );
  }

  // Rule 46(e): unregistered buyer and taxable value of Rs 50,000 or more -> name, address and state are required.
  if (tax && !isValidGstin(d.customerGstin) && c.taxable >= 5000000) {
    if (!d.customerAddress.trim()) block("address_50k", "For invoices of ₹50,000 or more, add the customer's address.", "customerAddress");
    if (!d.customerStateCode) block("state_50k", "For invoices of ₹50,000 or more, add the customer's state.", "customerState");
  }

  if (c.grandTotal > 5000000) {
    warn("eway", `This consignment is ${formatPaise(c.grandTotal, { decimals: false })}. Goods worth over ₹50,000 usually need an e-way bill before they move.`);
  }

  if (tax && c.lines.length && c.lines.every((l) => l.rate === 0)) {
    warn("all_exempt", "All items are at 0% GST, so this will be issued as a Bill of Supply.");
  }

  return out;
}

// ---------------------------------------------------------------------------------------------
// Saving and loading
// ---------------------------------------------------------------------------------------------

export type InvoiceWrite = Pick<
  InvoiceRow,
  | "doc_type"
  | "issue_date"
  | "customer_name"
  | "customer_phone"
  | "customer_address"
  | "customer_state_code"
  | "customer_gstin"
  | "place_of_supply"
  | "payment_mode"
  | "notes"
  | "lines"
  | "delivery_charge"
  | "totals"
  | "grand_total"
>;

export function draftToRow(d: Draft, b: Business): InvoiceWrite {
  const c = calcDraft(d, b);
  const lines: StoredLine[] = d.lines.map((l, i) => {
    const r = c.lines[i];
    return {
      product_id: l.productId,
      name: l.name.trim(),
      variant: l.variant.trim(),
      hsn: l.hsn.trim(),
      qty: l.qty,
      unit: l.unit,
      price: l.price,
      discount: l.discount,
      gst_rate: l.gstRate,
      rate_rule: l.rateRule,
      rate: r.rate,
      gross_p: r.gross,
      taxable_p: r.taxable,
      cgst_p: r.cgst,
      sgst_p: r.sgst,
      igst_p: r.igst,
      total_p: r.total,
    };
  });
  const totals: StoredTotals = {
    v: 1,
    title: titleFor(d, b, c),
    charges_gst: c.chargesGst,
    prices_include_gst: b.prices_include_gst,
    intra_state: c.intraState,
    state_tax_label: c.stateTaxLabel,
    taxable_p: c.taxable,
    cgst_p: c.cgst,
    sgst_p: c.sgst,
    igst_p: c.igst,
    tax_p: c.tax,
    exact_p: c.exact,
    round_off_p: c.roundOff,
    grand_total_p: c.grandTotal,
    delivery: c.delivery
      ? {
          gross_p: c.delivery.gross,
          rate: c.delivery.rate,
          taxable_p: c.delivery.taxable,
          cgst_p: c.delivery.cgst,
          sgst_p: c.delivery.sgst,
          igst_p: c.delivery.igst,
          total_p: c.delivery.total,
        }
      : null,
    summary: c.summary.map((s) => ({ hsn: s.hsn, rate: s.rate, taxable_p: s.taxable, cgst_p: s.cgst, sgst_p: s.sgst, igst_p: s.igst })),
    amount_in_words: amountInWords(c.grandTotal),
  };
  const gstin = normalizeGstin(d.customerGstin);
  return {
    doc_type: docTypeFor(b.gst_status),
    issue_date: d.issueDate,
    customer_name: d.customerName.trim(),
    customer_phone: d.customerPhone.trim(),
    customer_address: d.customerAddress.trim(),
    customer_state_code: d.customerStateCode,
    customer_gstin: gstin && isValidGstin(gstin) ? gstin : null,
    place_of_supply: d.placeOfSupply,
    payment_mode: d.paymentMode,
    notes: d.notes.trim(),
    lines,
    delivery_charge: d.delivery,
    totals,
    grand_total: c.grandTotal / 100,
  };
}

export function rowToDraft(row: InvoiceRow): Draft {
  return {
    id: row.id,
    issueDate: row.issue_date,
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    customerAddress: row.customer_address,
    customerStateCode: row.customer_state_code,
    customerGstin: row.customer_gstin ?? "",
    placeOfSupply: row.place_of_supply,
    delivery: Number(row.delivery_charge) || 0,
    paymentMode: row.payment_mode,
    notes: row.notes,
    checks: [],
    lines: (row.lines ?? []).map((l) => ({
      key: newKey(),
      productId: l.product_id,
      name: l.name,
      variant: l.variant ?? "",
      hsn: l.hsn ?? "",
      qty: Number(l.qty),
      unit: l.unit,
      price: Number(l.price),
      discount: Number(l.discount) || 0,
      gstRate: Number(l.gst_rate),
      rateRule: l.rate_rule,
      checks: [],
    })),
  };
}
