import { test } from "node:test";
import assert from "node:assert/strict";
import { pdfFileName, shareText, whatsappLink } from "../src/lib/pdf/share";
import { upiUri, type DocModel } from "../src/lib/invoice/doc";
import { hsnCsv, registerCsv } from "../src/lib/invoice/csv";
import type { InvoiceListRow } from "../src/lib/db";

const doc = { number: "INV/26-27/0001", grandTotalPaise: 329600, customer: { name: "Rohini Sharma", phone: "+91 98765 43210" }, seller: { name: "Noor Studio" }, upi: { vpa: "noor@okhdfcbank" } } as unknown as DocModel;

test("WhatsApp link uses the customer's number with country code", () => {
  assert.equal(whatsappLink("+91 98765 43210", "hi"), "https://wa.me/919876543210?text=hi");
  assert.equal(whatsappLink("09876543210", "hi"), "https://wa.me/919876543210?text=hi");
  assert.equal(whatsappLink("9876543210", "a b"), "https://wa.me/919876543210?text=a%20b");
  assert.equal(whatsappLink("", "hi"), "https://wa.me/?text=hi", "no number: WhatsApp asks whom to send to");
});

test("message text and file name", () => {
  assert.equal(shareText(doc), "Hi Rohini, here is your invoice INV/26-27/0001 from Noor Studio for ₹3,296.\nYou can pay by UPI to noor@okhdfcbank.\nThank you!");
  assert.equal(pdfFileName(doc), "INV-26-27-0001-Rohini-Sharma.pdf");
});

test("UPI payment link", () => {
  assert.equal(upiUri("noor@okhdfcbank", "Noor Studio", 329600, "INV/26-27/0001"), "upi://pay?pa=noor%40okhdfcbank&pn=Noor%20Studio&am=3296.00&cu=INR&tn=INV%2F26-27%2F0001");
});

test("CA spreadsheets escape formula-like text and split rates", () => {
  const row = (o: Partial<InvoiceListRow>): InvoiceListRow => ({
    id: "1", status: "issued", doc_type: "tax_invoice", invoice_no: "INV/26-27/0001", fy: "26-27", seq: 1, issue_date: "2026-10-15",
    customer_name: "=HYPERLINK(\"x\")", customer_phone: "", customer_gstin: null, customer_state_code: "07", place_of_supply: "07",
    payment_mode: "cod", payment_status: "unpaid", grand_total: 1180, created_at: "", cancelled_at: null,
    totals: { charges_gst: true, exact_p: 118000, grand_total_p: 118000, summary: [
      { hsn: "3303", rate: 18, taxable_p: 50000, cgst_p: 4500, sgst_p: 4500, igst_p: 0 },
      { hsn: "3406", rate: 5, taxable_p: 40000, cgst_p: 1000, sgst_p: 1000, igst_p: 0 },
    ] } as never, ...o });
  const csv = registerCsv([row({}), row({ id: "2", status: "draft", invoice_no: null })]);
  const lines = csv.replace("﻿", "").trim().split("\r\n");
  assert.equal(lines.length, 3, "header + one row per rate; drafts left out");
  assert.ok(lines[1].includes(`"'=HYPERLINK(""x"")"`), lines[1]);
  assert.ok(lines[1].includes(",5,400.00,10.00,10.00,0.00,1180.00,Unpaid"), lines[1]);
  assert.ok(lines[2].endsWith(",18,500.00,45.00,45.00,0.00,,"), lines[2]);
  const h = hsnCsv([row({}), row({ id: "3", customer_gstin: "27AAPFU0939F1ZV" })]).trim().split("\r\n");
  assert.equal(h.length, 5);
  assert.ok(h.includes("B2B,3303,18,500.00,45.00,45.00,0.00,90.00"));
});
