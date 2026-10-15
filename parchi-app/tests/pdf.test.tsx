import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { renderToBuffer } from "@react-pdf/renderer";
import { InvoicePdf, registerFonts } from "../src/lib/pdf/InvoicePdf";
import { buildDoc } from "../src/lib/invoice/doc";
import { draftToRow, emptyDraft, lineFromProduct } from "../src/lib/invoice/draft";
import { gstinCheckChar } from "../src/lib/gst/gstin";
import type { Business, InvoiceRow, Product } from "../src/lib/types";

registerFonts(path.resolve("public/fonts"));
const OUT = process.env.PDF_OUT ?? mkdtempSync(path.join(tmpdir(), "parchi-pdf-"));

const GSTIN = "07AAPFU0939F1Z" + gstinCheckChar("07AAPFU0939F1Z");
const biz: Business = {
  user_id: "u", name: "Noor Studio", legal_name: "Noor Fashions LLP", address: "B-21, Lajpat Nagar II\nNew Delhi", state_code: "07",
  pincode: "110024", phone: "+91 98100 00000", email: "hello@noorstudio.in", gst_status: "regular", gstin: GSTIN,
  prices_include_gst: true, invoice_prefix: "INV", upi_id: "noorstudio@okhdfcbank", logo: null, signature: null,
  terms: "Exchange within 7 days of delivery.",
};
const kurta: Product = { id: "k", name: "Kurta", aliases: "", price: 1299, unit: "PCS", hsn: "6204", gst_rate: 5, rate_rule: "apparel_2500", archived: false };
const dupatta: Product = { ...kurta, id: "d", name: "Dupatta", price: 599, hsn: "6214" };

function issuedRow(b: Business, pos = "07"): InvoiceRow {
  const d = { ...emptyDraft(), issueDate: "2026-10-15", customerName: "Rohini Sharma", customerPhone: "+91 98765 43210",
    customerAddress: "H-14, Sector 9, Rohini, Delhi 110085", customerStateCode: pos, placeOfSupply: pos, delivery: 99, paymentMode: "cod" as const,
    lines: [{ ...lineFromProduct(kurta, 2), variant: "Blue, M" }, { ...lineFromProduct(dupatta, 1), variant: "White" }] };
  const w = draftToRow(d, b);
  return { ...(w as unknown as InvoiceRow), id: "i1", user_id: "u", status: "issued", invoice_no: "INV/26-27/0001", fy: "26-27", seq: 1,
    payment_status: "unpaid", paid_at: null, seller: null, issued_at: null, cancel_reason: null, cancelled_at: null, created_at: "", updated_at: "" } as InvoiceRow;
}

function textOf(buf: Buffer, name: string): string {
  const f = path.join(OUT, name);
  writeFileSync(f, buf);
  // Collapse whitespace: letter-spaced headings come out as "TAX    INVOICE".
  return execFileSync("pdftotext", [f, "-"]).toString().replace(/\s+/g, " ");
}

test("tax invoice PDF (intra-state) has every GST particular", async () => {
  const doc = buildDoc(issuedRow(biz), biz);
  const t = textOf(await renderToBuffer(<InvoicePdf doc={doc} qr={null} />), "tax-invoice-delhi.pdf");
  for (const want of ["TAX INVOICE", "ORIGINAL FOR RECIPIENT", "Noor Studio", "Noor Fashions LLP", `GSTIN ${GSTIN}`, "INV/26-27/0001", "15 Oct 2026",
    "Place of supply", "Delhi (07)", "Reverse charge", "Rohini Sharma", "6204", "6214", "Kurta", "Blue, M", "₹2,474.28", "₹64.22", "CGST", "SGST",
    "₹3,296.00", "Indian Rupees Three Thousand Two Hundred Ninety Six Only", "Authorised signatory", "For Noor Fashions LLP",
    "Delivery charges", "Cash on delivery", "Exchange within 7 days"]) {
    assert.ok(t.includes(want), `missing: ${want}\n${t}`);
  }
  assert.ok(!t.includes("IGST"));
});

test("inter-state PDF shows IGST only", async () => {
  const doc = buildDoc(issuedRow(biz, "27"), biz);
  const t = textOf(await renderToBuffer(<InvoicePdf doc={doc} qr={null} />), "tax-invoice-maharashtra.pdf");
  assert.ok(t.includes("IGST"));
  assert.ok(t.includes("Maharashtra (27)"));
  assert.ok(!/\bCGST\b/.test(t));
});

test("bill of supply (composition) and plain invoice (unregistered)", async () => {
  const comp = { ...biz, gst_status: "composition" as const };
  const t1 = textOf(await renderToBuffer(<InvoicePdf doc={buildDoc(issuedRow(comp), comp)} qr={null} />), "bill-of-supply.pdf");
  assert.ok(t1.includes("BILL OF SUPPLY"));
  assert.ok(t1.includes("Composition taxable person, not eligible to collect tax on supplies"));
  assert.ok(!t1.includes("CGST") && !t1.includes("Taxable value"));
  const un = { ...biz, gst_status: "unregistered" as const, gstin: null };
  const t2 = textOf(await renderToBuffer(<InvoicePdf doc={buildDoc(issuedRow(un), un)} qr={null} />), "invoice-unregistered.pdf");
  assert.ok(t2.includes(" INVOICE "), t2.slice(0, 200));
  assert.ok(!t2.includes("TAX INVOICE") && !t2.includes("GSTIN") && !t2.includes("HSN"));
  assert.ok(t2.includes("₹3,296.00"));
});

test("cancelled invoice is marked", async () => {
  const row = { ...issuedRow(biz), status: "cancelled" as const, cancel_reason: "Customer cancelled" };
  const t = textOf(await renderToBuffer(<InvoicePdf doc={buildDoc(row, biz)} qr={null} />), "cancelled.pdf");
  // (The rotated "CANCELLED" watermark was checked by eye on the rendered page; text extraction scrambles rotated text.)
  assert.ok(t.includes("Cancelled: Customer cancelled"));
});

test("long invoice flows onto a second page with the header row repeated", async () => {
  const row = issuedRow(biz);
  const many = Array.from({ length: 45 }, (_, i) => ({ ...row.lines[0], name: `Kurta style ${i + 1}` }));
  const t = textOf(await renderToBuffer(<InvoicePdf doc={buildDoc({ ...row, lines: many }, biz)} qr={null} />), "long.pdf");
  assert.ok(t.includes("Page 2 of"));
  assert.ok(t.includes("Kurta style 45"));
  assert.ok((t.match(/TAXABLE VALUE/g) ?? []).length >= 2, "table header repeated on the next page");
  assert.ok(t.includes("INV/26-27/0001 · Page 1 of"), "page numbers");
});
