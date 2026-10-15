import { stateByCode } from "./states";

/*
 * GSTIN: 15 characters.
 *   2 digits   state code
 *   10 chars   PAN (5 letters, 4 digits, 1 letter)
 *   1 char     entity number for that PAN in the state (1-9, A-Z)
 *   'Z'        fixed by default
 *   1 char     check character (base-36 checksum of the first 14)
 */
const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

export function normalizeGstin(value: string): string {
  return value.replace(/\s+/g, "").toUpperCase();
}

export function gstinCheckChar(first14: string): string {
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const v = CHARS.indexOf(first14[i]);
    const product = v * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(product / 36) + (product % 36);
  }
  return CHARS[(36 - (sum % 36)) % 36];
}

export type GstinProblem = "empty" | "length" | "format" | "state" | "checksum";

export function gstinProblem(raw: string): GstinProblem | null {
  const g = normalizeGstin(raw);
  if (!g) return "empty";
  if (g.length !== 15) return "length";
  if (!GSTIN_RE.test(g)) return "format";
  if (!stateByCode(g.slice(0, 2))) return "state";
  if (gstinCheckChar(g.slice(0, 14)) !== g[14]) return "checksum";
  return null;
}

export function isValidGstin(raw: string): boolean {
  return gstinProblem(raw) === null;
}

export function gstinMessage(problem: GstinProblem): string {
  switch (problem) {
    case "empty":
      return "Enter the GSTIN.";
    case "length":
      return "A GSTIN has 15 characters.";
    case "format":
      return "This doesn't look like a GSTIN. Check for typos (for example O instead of 0).";
    case "state":
      return "The first two digits should be a state code.";
    case "checksum":
      return "This GSTIN has a typo: its last character doesn't match. Copy it from the GST certificate.";
  }
}

export function stateCodeOfGstin(raw: string): string | null {
  const g = normalizeGstin(raw);
  return isValidGstin(g) ? g.slice(0, 2) : null;
}
