/*
 * Everything printed on an invoice, worked out once and used by both the on-screen invoice and the PDF,
 * so the two can never disagree.
 */

import { COMPOSITION_DECLARATION, UNITS } from "../gst/calc";
import { formatDate } from "../gst/dates";
import { formatPaise, formatRate } from "../gst/money";
import { stateByCode, stateLabel } from "../gst/states";
import { PAYMENT_LABELS, type Business, type InvoiceRow, type SellerSnapshot, type StoredTotals } from "../types";

export interface DocRow {
  n: string;
  description: string;
  variant: string;
  hsn: string;
  qty: string;
  price: string;
  discount: string;
  taxable: string;
  rate: string;
  amount: string;
}

export interface DocModel {
  title: string;
  copyLabel: string | null;
  declaration: string | null;
  isDraft: boolean;
  cancelled: { reason: string } | null;
  seller: {
    name: string;
    legalName: string | null;
    addressLines: string[];
    state: string;
    gstin: string | null;
    contact: string;
    logo: string | null;
    signature: string | null;
  };
  number: string;
  date: string;
  placeOfSupply: string | null;
  reverseCharge: string | null;
  customer: { name: string; addressLines: string[]; state: string; gstin: string | null; phone: string };
  showTax: boolean;
  showHsn: boolean;
  showDiscount: boolean;
  pricesIncludeGst: boolean;
  rows: DocRow[];
  summary: { hsn: string; rate: string; taxable: string; cgst: string; sgst: string; igst: string; tax: string }[];
  intraState: boolean;
  stateTaxLabel: string;
  totals: { label: string; value: string; strong?: boolean }[];
  grandTotal: string;
  grandTotalPaise: number;
  amountInWords: string;
  payment: string | null;
  paid: boolean;
  upi: { uri: string; amount: string; vpa: string } | null;
  notes: string;
  terms: string | null;
}

const unitLabel = (code: string) => (UNITS.some((u) => u.code === code) ? code : "");

function qtyText(q: number, unit: string): string {
  const n = Number.isInteger(q) ? String(q) : String(Number(q.toFixed(3)));
  return `${n} ${unitLabel(unit)}`.trim();
}

function splitAddress(a: string): string[] {
  return a
    .split(/\n+/)
    .map((x) => x.trim())
    .filter(Boolean);
}

export function upiUri(vpa: string, payeeName: string, amountPaise: number, note: string): string {
  const params = new URLSearchParams({
    pa: vpa,
    pn: payeeName.slice(0, 50),
    am: (amountPaise / 100).toFixed(2),
    cu: "INR",
    tn: note.slice(0, 50),
  });
  return `upi://pay?${params.toString().replace(/\+/g, "%20")}`;
}

/**
 * @param row  the invoice (issued, cancelled or a draft being previewed)
 * @param biz  the current business, used for logo and signature, and for seller details on drafts
 */
export function buildDoc(row: InvoiceRow, biz: Business): DocModel {
  const t = row.totals as StoredTotals;
  const seller: SellerSnapshot = row.seller ?? {
    name: biz.name,
    legal_name: biz.legal_name,
    address: biz.address,
    state_code: biz.state_code,
    pincode: biz.pincode,
    phone: biz.phone,
    email: biz.email,
    gst_status: biz.gst_status,
    gstin: biz.gstin,
    upi_id: biz.upi_id,
    terms: biz.terms,
  };
  const status = seller.gst_status;
  const showTax = t.charges_gst;
  const showHsn = status !== "unregistered";
  const showDiscount = row.lines.some((l) => Number(l.discount) > 0);
  const f = (p: number) => formatPaise(p);

  const rows: DocRow[] = row.lines.map((l, i) => ({
    n: String(i + 1),
    description: l.name,
    variant: l.variant,
    hsn: l.hsn,
    qty: qtyText(Number(l.qty), l.unit),
    price: formatPaise(Math.round(Number(l.price) * 100)),
    discount: Number(l.discount) > 0 ? formatPaise(Math.round(Number(l.discount) * 100)) : "",
    taxable: f(l.taxable_p),
    rate: showTax ? formatRate(l.rate) : "",
    amount: f(l.total_p),
  }));
  if (t.delivery) {
    const principal = row.lines.reduce((best, l, i) => (l.rate > (row.lines[best]?.rate ?? -1) ? i : best), 0);
    rows.push({
      n: "",
      description: "Delivery charges",
      variant: "",
      hsn: row.lines[principal]?.hsn ?? "",
      qty: "",
      price: f(t.delivery.gross_p),
      discount: "",
      taxable: f(t.delivery.taxable_p),
      rate: showTax ? formatRate(t.delivery.rate) : "",
      amount: f(t.delivery.total_p),
    });
  }

  const intraState = t.intra_state !== false;
  const totals: DocModel["totals"] = [];
  if (showTax) {
    totals.push({ label: "Taxable value", value: f(t.taxable_p) });
    if (intraState) {
      totals.push({ label: "CGST", value: f(t.cgst_p) });
      totals.push({ label: t.state_tax_label, value: f(t.sgst_p) });
    } else {
      totals.push({ label: "IGST", value: f(t.igst_p) });
    }
  } else if (t.round_off_p !== 0) {
    totals.push({ label: "Subtotal", value: f(t.exact_p) });
  }
  if (t.round_off_p !== 0) totals.push({ label: "Round off", value: `${t.round_off_p > 0 ? "+" : ""}${f(t.round_off_p)}` });

  const titleIsTaxInvoice = status === "regular" || status === "composition";
  const paid = row.payment_status === "paid";
  const number = row.invoice_no ?? "Draft";
  const upi =
    seller.upi_id && !paid && row.status !== "cancelled" && t.grand_total_p > 0
      ? {
          uri: upiUri(seller.upi_id, seller.legal_name || seller.name, t.grand_total_p, row.invoice_no ?? "Invoice"),
          amount: f(t.grand_total_p),
          vpa: seller.upi_id,
        }
      : null;

  return {
    title: t.title,
    copyLabel: titleIsTaxInvoice ? "Original for recipient" : null,
    declaration: status === "composition" ? COMPOSITION_DECLARATION : null,
    isDraft: row.status === "draft",
    cancelled: row.status === "cancelled" ? { reason: row.cancel_reason ?? "" } : null,
    seller: {
      name: seller.name,
      legalName: seller.legal_name && seller.legal_name !== seller.name ? seller.legal_name : null,
      addressLines: [...splitAddress(seller.address), [stateByCode(seller.state_code)?.name, seller.pincode].filter(Boolean).join(" ")].filter(Boolean),
      state: stateLabel(seller.state_code),
      gstin: seller.gstin,
      contact: [seller.phone, seller.email].filter(Boolean).join(" · "),
      logo: biz.logo,
      signature: biz.signature,
    },
    number,
    date: formatDate(row.issue_date),
    placeOfSupply: status === "regular" && row.place_of_supply ? stateLabel(row.place_of_supply) : null,
    reverseCharge: status === "regular" ? "No" : null,
    customer: {
      name: row.customer_name,
      addressLines: splitAddress(row.customer_address),
      state: stateLabel(row.customer_state_code),
      gstin: row.customer_gstin,
      phone: row.customer_phone,
    },
    showTax,
    showHsn,
    showDiscount,
    pricesIncludeGst: t.prices_include_gst,
    rows,
    summary: showTax
      ? t.summary.map((s) => ({
          hsn: s.hsn,
          rate: formatRate(s.rate),
          taxable: f(s.taxable_p),
          cgst: f(s.cgst_p),
          sgst: f(s.sgst_p),
          igst: f(s.igst_p),
          tax: f(s.cgst_p + s.sgst_p + s.igst_p),
        }))
      : [],
    intraState,
    stateTaxLabel: t.state_tax_label,
    totals,
    grandTotal: f(t.grand_total_p),
    grandTotalPaise: t.grand_total_p,
    // A non-breaking space keeps "Only" with the word before it, so it never sits alone on a line.
    amountInWords: (t.amount_in_words ?? "").replace(/ (\S+)$/, "\u00a0$1"),
    payment: row.payment_mode ? PAYMENT_LABELS[row.payment_mode] : null,
    paid,
    upi,
    notes: row.notes,
    terms: seller.terms,
  };
}
