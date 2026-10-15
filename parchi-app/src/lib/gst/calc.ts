/*
 * Invoice maths, following how a CA would prepare a GST invoice:
 *
 * - Tax is worked out line by line on the taxable value (after discount), then summed.
 * - If the seller's prices include GST (usual for D2C), the GST is backed out of the price:
 *     taxable = price x 100 / (100 + rate), GST = price - taxable. Each line adds up to exactly the price the
 *     customer was quoted.
 * - Same state as the seller (intra-state)  -> CGST + SGST, each half the rate.
 *   Seller's state is a Union Territory without a legislature -> CGST + UTGST.
 *   Different state (inter-state)            -> IGST at the full rate.
 *   Place of supply for goods is where delivery ends, so it is the delivery state the seller confirms.
 * - Clothing and footwear ("apparel_2500"): 5% when the value per piece is up to Rs 2,500, 18% above.
 *   The value per piece is the taxable value after discount. With GST-inclusive prices we test the price
 *   backed out at 5%; if that is above Rs 2,500 the item is taxed at 18%.
 * - Delivery charged on the invoice is part of a composite supply, so it takes the GST rate of the goods.
 *   If the goods have different rates we use the highest one (the cautious choice).
 * - Composition sellers (bill of supply) and unregistered sellers charge no GST at all.
 * - The grand total is rounded to the nearest rupee and the difference is shown as "Round off".
 */

import { divRound, toPaise } from "./money";
import { stateByCode } from "./states";

export type GstStatus = "unregistered" | "composition" | "regular";
export type DocType = "tax_invoice" | "bill_of_supply" | "invoice";
export type RateRule = "fixed" | "apparel_2500";

export const GST_RATES = [0, 0.25, 1.5, 3, 5, 12, 18, 28, 40] as const;
export const APPAREL_LIMIT_PAISE = 250000;

export const UNITS = [
  { code: "PCS", label: "Pieces" },
  { code: "NOS", label: "Numbers" },
  { code: "PRS", label: "Pairs" },
  { code: "SET", label: "Sets" },
  { code: "PAC", label: "Packs" },
  { code: "BOX", label: "Boxes" },
  { code: "DOZ", label: "Dozens" },
  { code: "KGS", label: "Kilograms" },
  { code: "GMS", label: "Grams" },
  { code: "LTR", label: "Litres" },
  { code: "MLT", label: "Millilitres" },
  { code: "MTR", label: "Metres" },
  { code: "BTL", label: "Bottles" },
  { code: "OTH", label: "Others" },
] as const;
export type Unit = (typeof UNITS)[number]["code"];

export function docTypeFor(status: GstStatus): DocType {
  return status === "regular" ? "tax_invoice" : status === "composition" ? "bill_of_supply" : "invoice";
}

export interface LineInput {
  name: string;
  hsn: string;
  qty: number;
  unit: Unit;
  /** Price per unit in rupees, as the seller enters it (GST-inclusive if the business says so). */
  price: number;
  /** Discount on this line, in rupees (same basis as the price). */
  discount: number;
  /** GST rate in percent (ignored for apparel_2500, which picks 5 or 18). */
  gstRate: number;
  rateRule: RateRule;
}

export interface CalcInput {
  gstStatus: GstStatus;
  pricesIncludeGst: boolean;
  sellerStateCode: string;
  /** State code where the goods are delivered; null if not chosen yet. */
  placeOfSupply: string | null;
  lines: LineInput[];
  /** Delivery charge in rupees (same basis as prices). */
  delivery: number;
}

export interface LineResult {
  /** qty x price - discount, in paise, on the seller's price basis */
  gross: number;
  rate: number;
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
  /** Rate was chosen by the apparel rule */
  apparelRate: boolean;
}

export interface RateSummary {
  rate: number;
  hsn: string;
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
}

export interface CalcResult {
  chargesGst: boolean;
  /** true when CGST+SGST/UTGST, false when IGST; null when place of supply isn't known yet */
  intraState: boolean | null;
  /** "SGST" or "UTGST" */
  stateTaxLabel: "SGST" | "UTGST";
  lines: LineResult[];
  delivery: LineResult | null;
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  tax: number;
  /** Sum before rounding, in paise */
  exact: number;
  roundOff: number;
  grandTotal: number;
  /** Tax summary grouped by HSN and rate (for the invoice footer and GSTR-1 HSN summary) */
  summary: RateSummary[];
}

/** Rate for apparel/footwear under the Rs 2,500 per piece rule. */
export function apparelRate(grossPaise: number, qty: number, inclusive: boolean): number {
  if (qty <= 0) return 5;
  const perPiece = grossPaise / qty;
  const valueAt5 = inclusive ? (perPiece * 100) / 105 : perPiece;
  return valueAt5 <= APPAREL_LIMIT_PAISE + 1e-9 ? 5 : 18;
}

function lineTax(
  gross: number,
  rate: number,
  inclusive: boolean,
  chargesGst: boolean,
  intra: boolean,
): Omit<LineResult, "gross" | "rate" | "apparelRate"> {
  if (!chargesGst || rate === 0) {
    return { taxable: gross, cgst: 0, sgst: 0, igst: 0, total: gross };
  }
  const bp = Math.round(rate * 100); // 5% -> 500 basis points
  if (inclusive) {
    // The tax inside the price, so the line still adds up to exactly what the customer was quoted.
    // CGST and SGST must be equal, so an odd paisa moves into the taxable value (a 1-paisa rounding).
    const tax = gross - divRound(gross * 10000, 10000 + bp);
    if (intra) {
      const half = divRound(tax, 2);
      return { taxable: gross - 2 * half, cgst: half, sgst: half, igst: 0, total: gross };
    }
    return { taxable: gross - tax, cgst: 0, sgst: 0, igst: tax, total: gross };
  }
  const taxable = gross;
  if (intra) {
    const half = divRound(taxable * bp, 20000);
    return { taxable, cgst: half, sgst: half, igst: 0, total: taxable + 2 * half };
  }
  const igst = divRound(taxable * bp, 10000);
  return { taxable, cgst: 0, sgst: 0, igst, total: taxable + igst };
}

export function calculate(input: CalcInput): CalcResult {
  const chargesGst = input.gstStatus === "regular";
  const pos = input.placeOfSupply;
  const intraState = pos ? pos === input.sellerStateCode : null;
  // When place of supply is unknown we still show a provisional intra-state split; issuing is blocked until it's set.
  const intra = intraState ?? true;
  const sellerState = stateByCode(input.sellerStateCode);
  const stateTaxLabel = sellerState?.ut ? "UTGST" : "SGST";

  const lines: LineResult[] = input.lines.map((l) => {
    const qty = Number.isFinite(l.qty) ? l.qty : 0;
    const gross = Math.max(0, Math.round(qty * toPaise(l.price)) - toPaise(l.discount || 0));
    const useApparel = chargesGst && l.rateRule === "apparel_2500";
    const rate = chargesGst ? (useApparel ? apparelRate(gross, qty, input.pricesIncludeGst) : l.gstRate) : 0;
    return { gross, rate, apparelRate: useApparel, ...lineTax(gross, rate, input.pricesIncludeGst, chargesGst, intra) };
  });

  let delivery: LineResult | null = null;
  const deliveryGross = Math.max(0, toPaise(input.delivery || 0));
  if (deliveryGross > 0) {
    const rate = chargesGst ? Math.max(0, ...lines.map((l) => l.rate)) : 0;
    delivery = {
      gross: deliveryGross,
      rate,
      apparelRate: false,
      ...lineTax(deliveryGross, rate, input.pricesIncludeGst, chargesGst, intra),
    };
  }

  const all = delivery ? [...lines, delivery] : lines;
  const sum = (k: "taxable" | "cgst" | "sgst" | "igst" | "total") => all.reduce((s, l) => s + l[k], 0);
  const taxable = sum("taxable");
  const cgst = sum("cgst");
  const sgst = sum("sgst");
  const igst = sum("igst");
  const exact = sum("total");
  const grandTotal = divRound(exact, 100) * 100;

  // HSN + rate summary. Delivery is reported under the HSN of the highest-rate item (its principal supply).
  const summaryMap = new Map<string, RateSummary>();
  const add = (hsn: string, r: LineResult) => {
    const key = `${hsn}|${r.rate}`;
    const s = summaryMap.get(key) ?? { hsn, rate: r.rate, taxable: 0, cgst: 0, sgst: 0, igst: 0 };
    s.taxable += r.taxable;
    s.cgst += r.cgst;
    s.sgst += r.sgst;
    s.igst += r.igst;
    summaryMap.set(key, s);
  };
  lines.forEach((r, i) => add(input.lines[i].hsn || "", r));
  if (delivery) {
    let principal = -1;
    lines.forEach((r, i) => {
      if (principal < 0 || r.rate > lines[principal].rate) principal = i;
    });
    add(principal >= 0 ? input.lines[principal].hsn || "" : "", delivery);
  }

  return {
    chargesGst,
    intraState,
    stateTaxLabel,
    lines,
    delivery,
    taxable,
    cgst,
    sgst,
    igst,
    tax: cgst + sgst + igst,
    exact,
    roundOff: grandTotal - exact,
    grandTotal,
    summary: [...summaryMap.values()].sort((a, b) => a.hsn.localeCompare(b.hsn) || a.rate - b.rate),
  };
}

/** Title printed at the top of the document. */
export function documentTitle(status: GstStatus, lineRates: number[], customerRegistered: boolean): string {
  if (status === "composition") return "Bill of Supply";
  if (status === "unregistered") return "Invoice";
  const taxed = lineRates.some((r) => r > 0);
  const exempt = lineRates.some((r) => r === 0);
  if (!taxed && lineRates.length > 0) return "Bill of Supply";
  // Rule 46A: taxable and exempt goods to an unregistered buyer may go on one "invoice-cum-bill of supply".
  if (taxed && exempt && !customerRegistered) return "Invoice-cum-Bill of Supply";
  return "Tax Invoice";
}

export const COMPOSITION_DECLARATION = "Composition taxable person, not eligible to collect tax on supplies";
