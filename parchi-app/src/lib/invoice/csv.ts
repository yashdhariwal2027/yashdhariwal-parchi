/*
 * Exports for the seller's CA: invoice-wise GST register and HSN summary for a financial year.
 * Opens in Excel or Google Sheets.
 */

import type { InvoiceListRow } from "../db";
import { stateByCode } from "../gst/states";
import type { StoredTotals } from "../types";

function cell(v: string | number | null | undefined): string {
  let s = v === null || v === undefined ? "" : String(v);
  // Stop spreadsheet apps from running text that starts like a formula (e.g. a customer named "=...").
  if (/^[=+\-@]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
  if (/[",\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

function csv(rows: (string | number | null)[][]): string {
  return "﻿" + rows.map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}

const rs = (paise: number) => (paise / 100).toFixed(2);
const dmy = (iso: string) => iso.split("-").reverse().join("-");
const pos = (code: string | null) => (code ? `${code}-${stateByCode(code)?.name ?? ""}` : "");

const DOC_NAMES: Record<string, string> = { tax_invoice: "Tax invoice", bill_of_supply: "Bill of supply", invoice: "Invoice" };

/** One row per invoice per GST rate (the shape GSTR-1 tables need), plus cancelled invoices for the number sequence. */
export function registerCsv(invoices: InvoiceListRow[]): string {
  const issued = invoices.filter((i) => i.status !== "draft").sort((a, b) => (a.fy ?? "").localeCompare(b.fy ?? "") || (a.seq ?? 0) - (b.seq ?? 0));
  const out: (string | number | null)[][] = [
    ["Invoice number", "Date", "Status", "Document", "Customer", "Customer GSTIN", "Type", "Place of supply", "GST rate %", "Taxable value", "CGST", "SGST/UTGST", "IGST", "Invoice total", "Payment"],
  ];
  for (const inv of issued) {
    const t = inv.totals as StoredTotals;
    const base = [inv.invoice_no, dmy(inv.issue_date)];
    const type = inv.customer_gstin ? "B2B" : "B2C";
    if (inv.status === "cancelled") {
      out.push([...base, "Cancelled", DOC_NAMES[inv.doc_type], inv.customer_name, inv.customer_gstin ?? "", type, pos(inv.place_of_supply), "", "", "", "", "", "", ""]);
      continue;
    }
    const byRate = new Map<number, { taxable: number; cgst: number; sgst: number; igst: number }>();
    for (const s of t.summary ?? []) {
      const r = byRate.get(s.rate) ?? { taxable: 0, cgst: 0, sgst: 0, igst: 0 };
      r.taxable += s.taxable_p;
      r.cgst += s.cgst_p;
      r.sgst += s.sgst_p;
      r.igst += s.igst_p;
      byRate.set(s.rate, r);
    }
    if (!t.charges_gst || byRate.size === 0) byRate.set(0, { taxable: t.exact_p, cgst: 0, sgst: 0, igst: 0 });
    let first = true;
    for (const [rate, r] of [...byRate.entries()].sort((a, b) => a[0] - b[0])) {
      out.push([
        ...base,
        "Issued",
        DOC_NAMES[inv.doc_type],
        inv.customer_name,
        inv.customer_gstin ?? "",
        type,
        pos(inv.place_of_supply ?? inv.customer_state_code),
        rate,
        rs(r.taxable),
        rs(r.cgst),
        rs(r.sgst),
        rs(r.igst),
        first ? rs(t.grand_total_p) : "",
        first ? (inv.payment_status === "paid" ? "Paid" : "Unpaid") : "",
      ]);
      first = false;
    }
  }
  return csv(out);
}

/** HSN-wise summary split into B2B and B2C (GSTR-1 Table 12). Cancelled invoices are left out. */
export function hsnCsv(invoices: InvoiceListRow[]): string {
  const map = new Map<string, { type: string; hsn: string; rate: number; taxable: number; cgst: number; sgst: number; igst: number; count: number }>();
  for (const inv of invoices) {
    if (inv.status !== "issued") continue;
    const t = inv.totals as StoredTotals;
    if (!t.charges_gst) continue;
    const type = inv.customer_gstin ? "B2B" : "B2C";
    for (const s of t.summary ?? []) {
      const key = `${type}|${s.hsn}|${s.rate}`;
      const r = map.get(key) ?? { type, hsn: s.hsn, rate: s.rate, taxable: 0, cgst: 0, sgst: 0, igst: 0, count: 0 };
      r.taxable += s.taxable_p;
      r.cgst += s.cgst_p;
      r.sgst += s.sgst_p;
      r.igst += s.igst_p;
      r.count += 1;
      map.set(key, r);
    }
  }
  const rows = [...map.values()].sort((a, b) => a.type.localeCompare(b.type) || a.hsn.localeCompare(b.hsn) || a.rate - b.rate);
  return csv([
    ["Type", "HSN", "GST rate %", "Taxable value", "CGST", "SGST/UTGST", "IGST", "Total tax"],
    ...rows.map((r) => [r.type, r.hsn, r.rate, rs(r.taxable), rs(r.cgst), rs(r.sgst), rs(r.igst), rs(r.cgst + r.sgst + r.igst)]),
  ]);
}
