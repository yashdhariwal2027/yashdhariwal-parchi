/* Making the PDF, downloading it, and sending it on WhatsApp. */

import QRCode from "qrcode";
import type { DocModel } from "../invoice/doc";
import { formatPaise } from "../gst/money";

export async function makePdf(doc: DocModel): Promise<Blob> {
  const [{ pdf }, { InvoicePdf, registerFonts }] = await Promise.all([import("@react-pdf/renderer"), import("./InvoicePdf")]);
  registerFonts(`${window.location.origin}/fonts`);
  const qr = doc.upi ? await QRCode.toDataURL(doc.upi.uri, { margin: 1, width: 300 }) : null;
  return pdf(InvoicePdf({ doc, qr })).toBlob();
}

export function pdfFileName(doc: DocModel): string {
  const safe = (s: string) => s.replace(/[^A-Za-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
  return `${safe(doc.number) || "invoice"}-${safe(doc.customer.name).slice(0, 30) || "customer"}.pdf`;
}

export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export function shareText(doc: DocModel): string {
  const first = doc.customer.name.split(/\s+/)[0] || "there";
  const lines = [`Hi ${first}, here is your invoice ${doc.number} from ${doc.seller.name} for ${formatPaise(doc.grandTotalPaise, { decimals: doc.grandTotalPaise % 100 !== 0 })}.`];
  if (doc.upi) lines.push(`You can pay by UPI to ${doc.upi.vpa}.`);
  lines.push("Thank you!");
  return lines.join("\n");
}

/** WhatsApp link to the customer's number (wa.me needs the country code, no +). */
export function whatsappLink(phone: string, text: string): string {
  const d = phone.replace(/\D/g, "");
  const intl = d.length === 10 ? `91${d}` : d.length === 12 && d.startsWith("91") ? d : d.length === 11 && d.startsWith("0") ? `91${d.slice(1)}` : "";
  return intl ? `https://wa.me/${intl}?text=${encodeURIComponent(text)}` : `https://wa.me/?text=${encodeURIComponent(text)}`;
}

export type SendResult = "shared" | "cancelled" | "fallback";

/**
 * Phones (Android Chrome, iPhone Safari): opens the share sheet with the PDF attached, so the seller picks WhatsApp.
 * Elsewhere: downloads the PDF and opens WhatsApp with the message, so the seller attaches the file.
 */
export async function sendInvoice(doc: DocModel, blob: Blob): Promise<SendResult> {
  const file = new File([blob], pdfFileName(doc), { type: "application/pdf" });
  const text = shareText(doc);
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], text, title: `${doc.title} ${doc.number}` });
      return "shared";
    } catch (e) {
      if ((e as DOMException)?.name === "AbortError") return "cancelled";
      // Some browsers refuse files at the last step; fall through to the download route.
    }
  }
  downloadBlob(blob, file.name);
  window.open(whatsappLink(doc.customer.phone, text), "_blank", "noopener");
  return "fallback";
}
