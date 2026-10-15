/*
 * Details read on the device, without AI: phone numbers (which are never sent to the AI) and PIN codes.
 * Keep the phone pattern in sync with maskPhones() in api/parse.ts (a test checks they agree).
 */

const PHONE_CANDIDATE = /(?<!\d)(?:\(\+?91\)[\s.-]*|(?:\+|00)?91[\s.-]*|0)?[6-9](?:[\s.-]*\d){9}(?!\d)/g;

function asIndianMobile(digits: string): string | null {
  if (/^[6-9]\d{9}$/.test(digits)) return digits;
  if (/^91[6-9]\d{9}$/.test(digits)) return digits.slice(2);
  if (/^0091[6-9]\d{9}$/.test(digits)) return digits.slice(4);
  if (/^0[6-9]\d{9}$/.test(digits)) return digits.slice(1);
  return null;
}

/** All Indian mobile numbers in the text, as 10 digits, in order, without duplicates. */
export function findPhones(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(PHONE_CANDIDATE)) {
    const n = asIndianMobile(m[0].replace(/\D/g, ""));
    if (n && !out.includes(n)) out.push(n);
  }
  return out;
}

/** "9876543210" -> "+91 98765 43210" */
export function formatPhone(tenDigits: string): string {
  const d = tenDigits.replace(/\D/g, "").slice(-10);
  return d.length === 10 ? `+91 ${d.slice(0, 5)} ${d.slice(5)}` : tenDigits;
}

/** 6-digit PIN codes (also "110 085"), first one wins. */
export function findPin(text: string): string | null {
  // Remove phone numbers first so their digits are never mistaken for a PIN.
  const clean = text.replace(PHONE_CANDIDATE, (m) => (asIndianMobile(m.replace(/\D/g, "")) ? " | " : m));
  const m = clean.match(/(?<![\d₹.,])([1-9]\d{2}) ?(\d{3})(?![\d,.])/);
  return m ? m[1] + m[2] : null;
}
