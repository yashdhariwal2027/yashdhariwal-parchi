/*
 * Money is handled in whole paise (integers) so totals never drift from floating-point rounding.
 * Rounding is "half up", which is how Indian invoices round (0.5 paise and above goes up).
 */

export function toPaise(rupees: number): number {
  if (!Number.isFinite(rupees)) return 0;
  // toFixed avoids 1.005 * 100 = 100.49999 style errors.
  return Math.round(Number((rupees * 100).toFixed(4)));
}

export function toRupees(paise: number): number {
  return paise / 100;
}

/** Divides and rounds half up (for non-negative values; negatives round away from zero symmetrically). */
export function divRound(numerator: number, denominator: number): number {
  const q = numerator / denominator;
  const sign = q < 0 ? -1 : 1;
  return sign * Math.floor(Math.abs(q) + 0.5 + 1e-9);
}

const INR = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const INR0 = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

/** 329600 -> "₹3,296.00" */
export function formatPaise(paise: number, opts: { symbol?: boolean; decimals?: boolean } = {}): string {
  const { symbol = true, decimals = true } = opts;
  const neg = paise < 0;
  const body = decimals ? INR.format(Math.abs(paise) / 100) : INR0.format(Math.round(Math.abs(paise) / 100));
  return `${neg ? "−" : ""}${symbol ? "₹" : ""}${body}`;
}

/** Shows a rate like 5 -> "5%", 0.25 -> "0.25%", 1.5 -> "1.5%" */
export function formatRate(rate: number): string {
  return `${Number(rate.toFixed(2))}%`;
}
