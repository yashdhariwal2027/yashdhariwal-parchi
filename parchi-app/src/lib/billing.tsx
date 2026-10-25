/* The seller's plan: what's active, what's left, and paying for a new 30-day pass with Dodo Payments. */

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { supabase } from "./supabase";
import type { PlanId } from "./plans";

export interface ActivePass {
  plan: PlanId;
  starts_at: string;
  ends_at: string;
  invoices_used: number;
  invoice_limit: number;
  reads_used: number;
  read_limit: number;
  comp: boolean;
}

export interface BillingStatus {
  active: ActivePass | null;
  next: { plan: PlanId; starts_at: string; ends_at: string } | null;
  now: string;
}

export interface PassRow {
  id: string;
  plan: PlanId;
  amount_paise: number;
  status: "created" | "paid" | "comp";
  razorpay_payment_id: string | null;
  starts_at: string | null;
  ends_at: string | null;
  paid_at: string | null;
}

export async function fetchBillingStatus(): Promise<BillingStatus> {
  const { data, error } = await supabase.rpc("billing_status");
  if (error) throw error;
  return data as BillingStatus;
}

export async function fetchPayments(): Promise<PassRow[]> {
  const { data, error } = await supabase
    .from("billing_passes")
    .select("id,plan,amount_paise,status,razorpay_payment_id,starts_at,ends_at,paid_at")
    .in("status", ["paid", "comp"])
    .order("paid_at", { ascending: false })
    .limit(24);
  if (error) throw error;
  return data as PassRow[];
}

/** What the seller can do right now, worked out from the status (kept simple for the screens). */
export function summarize(s: BillingStatus | null | undefined, now = Date.now()) {
  const a = s?.active ?? null;
  const daysLeft = a ? Math.max(0, Math.ceil((Date.parse(a.ends_at) - now) / 86_400_000)) : 0;
  const invoicesLeft = a ? Math.max(0, a.invoice_limit - a.invoices_used) : 0;
  return {
    active: a,
    next: s?.next ?? null,
    canInvoice: Boolean(a && invoicesLeft > 0),
    usedUp: Boolean(a && invoicesLeft === 0),
    invoicesLeft,
    daysLeft,
    endingSoon: Boolean(a && daysLeft <= 3),
    runningLow: Boolean(a && invoicesLeft > 0 && a.invoices_used >= a.invoice_limit * 0.8),
    /** A new pass would start right away (none active, or the active one is used up) */
    newPassStartsNow: !a || invoicesLeft === 0,
  };
}

// ---------------------------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------------------------

interface BillingState {
  /** undefined while loading */
  status: BillingStatus | undefined;
  error: string | null;
  reload: () => Promise<void>;
}

const Ctx = createContext<BillingState | null>(null);

export function BillingProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<BillingStatus | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => {
    setError(null);
    try {
      setStatus(await fetchBillingStatus());
    } catch {
      setError("Couldn't load your plan. Check your connection and try again.");
    }
  }, []);
  useEffect(() => {
    reload();
    // Passes start and end with time, so check again when the seller comes back to the tab.
    const onFocus = () => document.visibilityState === "visible" && reload();
    document.addEventListener("visibilitychange", onFocus);
    return () => document.removeEventListener("visibilitychange", onFocus);
  }, [reload]);
  const value = useMemo(() => ({ status, error, reload }), [status, error, reload]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useBilling(): BillingState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useBilling outside BillingProvider");
  return v;
}

// ---------------------------------------------------------------------------------------------
// Checkout (Dodo Payments hosted page: we send the seller there, Dodo sends them back to /plan)
// ---------------------------------------------------------------------------------------------

async function call(action: string, body: unknown): Promise<{ status: number; body: Record<string, unknown> | null }> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const res = await fetch(`/api/billing?action=${action}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json().catch(() => null)) as Record<string, unknown> | null };
}

export type CheckoutResult =
  | { kind: "paid"; plan: PlanId; startsAt: string; endsAt: string }
  | { kind: "pending"; message: string }
  | { kind: "redirecting" }
  | { kind: "failed"; message: string };

const GENERIC = "Couldn't start the payment. Please try again.";

/** Starts a Dodo checkout for a 30-day pass and sends the seller to Dodo's payment page. */
export async function buyPass(plan: PlanId, go: (url: string) => void = (url) => window.location.assign(url)): Promise<CheckoutResult> {
  let r: { status: number; body: Record<string, unknown> | null };
  try {
    r = await call("order", { plan });
  } catch {
    return { kind: "failed", message: "You seem to be offline. Check your internet connection and try again." };
  }
  const b = r.body;
  const url = typeof b?.checkoutUrl === "string" ? b.checkoutUrl : "";
  if (!b?.ok || !/^(https:\/\/|http:\/\/localhost[:/])/.test(url)) return { kind: "failed", message: typeof b?.message === "string" ? b.message : GENERIC };
  go(url);
  return { kind: "redirecting" };
}

/** Back from Dodo's page with ?payment_id=...: asks our server to check the payment and start the pass. */
export async function confirmReturn(paymentId: string): Promise<CheckoutResult> {
  try {
    const v = await call("verify", { payment_id: paymentId });
    const b = v.body;
    if (b?.ok) {
      const pass = b.pass as { plan: PlanId; starts_at: string; ends_at: string };
      return { kind: "paid", plan: pass.plan, startsAt: pass.starts_at, endsAt: pass.ends_at };
    }
    if (b?.error === "pending") return { kind: "pending", message: String(b.message) };
    return { kind: "failed", message: typeof b?.message === "string" ? b.message : GENERIC };
  } catch {
    return { kind: "pending", message: "Payment received. Your plan will be ready in a minute. Refresh this page shortly." };
  }
}
