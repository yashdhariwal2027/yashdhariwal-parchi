/* The seller's plan: what's active, what's left, and paying for a new 30-day pass with Razorpay. */

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
// Checkout
// ---------------------------------------------------------------------------------------------

interface RazorpayResponse {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}

interface RazorpayInstance {
  open(): void;
  on(event: "payment.failed", cb: (r: { error?: { description?: string; reason?: string } }) => void): void;
}

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => RazorpayInstance;
  }
}

let scriptPromise: Promise<void> | null = null;

/** Loads Razorpay's checkout script once (it has to come from Razorpay's own site). */
export function loadRazorpay(src = "https://checkout.razorpay.com/v1/checkout.js"): Promise<void> {
  if (window.Razorpay) return Promise.resolve();
  if (!scriptPromise) {
    scriptPromise = new Promise<void>((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src;
      s.async = true;
      const timer = window.setTimeout(() => reject(new Error("checkout_timeout")), 20_000);
      s.onload = () => {
        window.clearTimeout(timer);
        if (window.Razorpay) resolve();
        else reject(new Error("checkout_unavailable"));
      };
      s.onerror = () => {
        window.clearTimeout(timer);
        reject(new Error("checkout_unavailable"));
      };
      document.head.appendChild(s);
    }).catch((e) => {
      scriptPromise = null;
      throw e;
    });
  }
  return scriptPromise;
}

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
  | { kind: "cancelled" }
  | { kind: "failed"; message: string };

const GENERIC = "Couldn't start the payment. Please try again.";

/**
 * Opens Razorpay Checkout for a 30-day pass. Resolves when the payment is confirmed by our server,
 * or when the seller closes the window.
 */
export async function buyPass(plan: PlanId, prefill: { email?: string; contact?: string; name?: string }): Promise<CheckoutResult> {
  try {
    await loadRazorpay();
  } catch {
    return { kind: "failed", message: "Couldn't open the payment window. Check your internet connection and try again." };
  }
  let order: { status: number; body: Record<string, unknown> | null };
  try {
    order = await call("order", { plan });
  } catch {
    return { kind: "failed", message: "You seem to be offline. Check your internet connection and try again." };
  }
  const o = order.body;
  if (!o?.ok) return { kind: "failed", message: typeof o?.message === "string" ? o.message : GENERIC };

  return new Promise<CheckoutResult>((resolve) => {
    let settled = false;
    const done = (r: CheckoutResult) => {
      if (!settled) {
        settled = true;
        resolve(r);
      }
    };
    const rzp = new window.Razorpay!({
      key: o.keyId,
      amount: o.amount,
      currency: o.currency,
      order_id: o.orderId,
      name: "Parchi",
      description: `${o.planName} plan, 30 days`,
      prefill: { email: prefill.email || o.email, contact: prefill.contact, name: prefill.name },
      notes: { plan },
      theme: { color: "#0e6b4f" },
      modal: { ondismiss: () => done({ kind: "cancelled" }), confirm_close: true },
      handler: async (resp: RazorpayResponse) => {
        try {
          const v = await call("verify", resp);
          const b = v.body;
          if (b?.ok) {
            const pass = b.pass as { plan: PlanId; starts_at: string; ends_at: string };
            done({ kind: "paid", plan: pass.plan, startsAt: pass.starts_at, endsAt: pass.ends_at });
          } else if (b?.error === "pending") {
            done({ kind: "pending", message: String(b.message) });
          } else {
            done({ kind: "failed", message: typeof b?.message === "string" ? b.message : GENERIC });
          }
        } catch {
          done({ kind: "pending", message: "Payment received. Your plan will be ready in a minute. Refresh this page shortly." });
        }
      },
    });
    rzp.on("payment.failed", (r) => {
      // Razorpay keeps its window open so the seller can try another way; we only note the reason.
      console.warn("Payment attempt failed", r?.error?.reason);
    });
    rzp.open();
  });
}
