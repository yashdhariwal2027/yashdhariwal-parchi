/*
 * Parchi's plans. Prices and limits must match the database (supabase/migrations/..._parchi_billing.sql,
 * billing_plan) and the server (api/billing.ts, PLANS). The database is what's enforced.
 */

export type PlanId = "starter" | "growth" | "pro";

export interface Plan {
  id: PlanId;
  name: string;
  /** Rupees for a 30-day pass */
  price: number;
  invoices: number;
  reads: number;
  /** One line on who it's for */
  forWho: string;
  popular?: boolean;
}

export const PLANS: Plan[] = [
  { id: "starter", name: "Starter", price: 249, invoices: 100, reads: 120, forWho: "For sellers just getting going, about 3 orders a day." },
  { id: "growth", name: "Growth", price: 349, invoices: 250, reads: 300, forWho: "For steady sellers, about 8 orders a day.", popular: true },
  { id: "pro", name: "Pro", price: 499, invoices: 500, reads: 600, forWho: "For busy shops and festive rushes, about 16 orders a day." },
];

export const PLAN_FEATURES = [
  "Paste a WhatsApp or Instagram order, get a GST-ready invoice",
  "Hinglish and messy messages understood",
  "CGST, SGST or IGST worked out for you",
  "PDF invoice to send on WhatsApp",
  "UPI QR code on every invoice",
  "Invoice register and HSN summary for your CA",
];

export function planById(id: string | null | undefined): Plan | undefined {
  return PLANS.find((p) => p.id === id);
}

export const PASS_DAYS = 30;

/** Remembers the plan someone picked on the landing page until they've signed up. */
const KEY = "parchi:chosen-plan";
export function rememberPlan(id: PlanId) {
  try {
    window.localStorage.setItem(KEY, id);
  } catch {
    /* storage unavailable */
  }
}
export function chosenPlan(): PlanId | null {
  try {
    const v = window.localStorage.getItem(KEY);
    return planById(v)?.id ?? null;
  } catch {
    return null;
  }
}
export function forgetChosenPlan() {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* storage unavailable */
  }
}
