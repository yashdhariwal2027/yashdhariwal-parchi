import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { Check, Sparkles } from "lucide-react";
import { useAuth, useBusiness } from "@/lib/auth";
import { buyPass, fetchPayments, summarize, useBilling, type BillingStatus, type PassRow } from "@/lib/billing";
import { chosenPlan, forgetChosenPlan, PLAN_FEATURES, PLANS, planById, type PlanId } from "@/lib/plans";
import { Notice, PageLoading, Spinner, useToast } from "@/components/ui";
import { cn } from "@/lib/utils";

export function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
}

const rupees = (n: number) => `₹${n.toLocaleString("en-IN")}`;

/** Buying a pass: shared by the Plan page and the "choose a plan" screen on New invoice. */
function useBuy() {
  const { session } = useAuth();
  const biz = useBusiness();
  const { reload } = useBilling();
  const toast = useToast();
  const [busy, setBusy] = useState<PlanId | null>(null);
  const [message, setMessage] = useState<{ tone: "danger" | "info"; text: string } | null>(null);

  async function buy(plan: PlanId): Promise<boolean> {
    setBusy(plan);
    setMessage(null);
    try {
      const r = await buyPass(plan, { email: session?.user.email ?? undefined, contact: biz.phone ?? undefined, name: biz.name });
      if (r.kind === "paid") {
        forgetChosenPlan();
        await reload();
        toast(`Payment received. ${planById(r.plan)?.name} plan ${Date.parse(r.startsAt) > Date.now() + 60_000 ? `starts on ${formatDay(r.startsAt)}` : `active until ${formatDay(r.endsAt)}`}.`);
        return true;
      }
      if (r.kind === "pending") {
        setMessage({ tone: "info", text: r.message });
        window.setTimeout(reload, 15_000);
      } else if (r.kind === "failed") {
        setMessage({ tone: "danger", text: r.message });
      }
      return false;
    } finally {
      setBusy(null);
    }
  }
  return { buy, busy, message };
}

export function PlanCards({
  status,
  highlight,
  busy,
  onBuy,
}: {
  status: BillingStatus | undefined;
  highlight?: PlanId | null;
  busy: PlanId | null;
  onBuy: (p: PlanId) => void;
}) {
  const s = summarize(status);
  const blocked = Boolean(s.next);
  return (
    <div>
      <ul className="grid gap-4 md:grid-cols-3" aria-label="Plans">
        {PLANS.map((p) => {
          const current = s.active?.plan === p.id;
          const marked = highlight ? highlight === p.id : p.popular;
          return (
            <li
              key={p.id}
              className={cn("card relative flex flex-col p-5", marked && "border-brand shadow-[0_0_0_1px_var(--color-brand)]")}
              data-testid={`plan-${p.id}`}
            >
              {(current || marked) && (
                <span className="absolute -top-3 left-5 rounded-full bg-brand px-2.5 py-0.5 text-[12px] font-semibold text-white">
                  {current ? "Your plan" : highlight === p.id ? "You picked" : "Most popular"}
                </span>
              )}
              <h3 className="text-[18px] font-semibold">{p.name}</h3>
              <p className="mt-2">
                <span className="tabular text-[30px] font-semibold tracking-tight">{rupees(p.price)}</span>
                <span className="text-muted"> / 30 days</span>
              </p>
              <p className="mt-1 text-[14px] text-muted">{p.forWho}</p>
              <ul className="mt-4 grid gap-1.5 text-[15px]">
                <li className="flex gap-2">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand" aria-hidden="true" />
                  <span>
                    <strong>{p.invoices}</strong> invoices
                  </span>
                </li>
                <li className="flex gap-2">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand" aria-hidden="true" />
                  <span>
                    <strong>{p.reads}</strong> AI order reads
                  </span>
                </li>
              </ul>
              <div className="mt-auto pt-5">
                <button
                  type="button"
                  className={cn("w-full", marked ? "btn-primary" : "btn-secondary")}
                  disabled={blocked || busy !== null}
                  onClick={() => onBuy(p.id)}
                >
                  {busy === p.id ? <Spinner label="Opening payment..." /> : `${current ? "Renew" : "Buy"} ${p.name} · ${rupees(p.price)}`}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      <div className="mt-4 grid gap-1 text-[14px] text-muted">
        {blocked && s.next ? (
          <p>
            Your next pass ({planById(s.next.plan)?.name}) is already paid for and starts on {formatDay(s.next.starts_at)}. You can buy another once it
            starts.
          </p>
        ) : s.active && !s.newPassStartsNow ? (
          <p>A pass you buy now starts when your current one ends on {formatDay(s.active.ends_at)}, so you don't lose any days.</p>
        ) : s.usedUp ? (
          <p>You've used all your invoices, so a new pass starts straight away.</p>
        ) : null}
        <p>Each pass lasts 30 days. Nothing renews or charges automatically. Pay by UPI, card or netbanking through Razorpay.</p>
      </div>
    </div>
  );
}

function Usage({ label, used, limit }: { label: string; used: number; limit: number }) {
  const pct = Math.min(100, Math.round((used / limit) * 100));
  return (
    <div>
      <div className="flex justify-between text-[14px]">
        <span>{label}</span>
        <span className="tabular text-muted">
          {used} of {limit}
        </span>
      </div>
      <div
        className="mt-1.5 h-2 overflow-hidden rounded-full bg-alt"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={limit}
        aria-valuenow={used}
      >
        <div className={cn("h-full rounded-full", pct >= 100 ? "bg-danger" : pct >= 80 ? "bg-warn" : "bg-brand")} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function PlanPage() {
  const { status, error, reload } = useBilling();
  const { buy, busy, message } = useBuy();
  const [payments, setPayments] = useState<PassRow[] | null>(null);
  const navigate = useNavigate();
  const s = summarize(status);

  // Fresh numbers every time the page opens (invoices issued since are counted).
  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    fetchPayments()
      .then(setPayments)
      .catch(() => setPayments([]));
  }, [status]);

  if (error) {
    return (
      <div className="mx-auto max-w-[560px]">
        <Notice tone="danger" role="alert">
          {error}
        </Notice>
        <button type="button" className="btn-secondary mt-4" onClick={reload}>
          Try again
        </button>
      </div>
    );
  }
  if (status === undefined) return <PageLoading />;
  const a = s.active;
  const plan = planById(a?.plan);

  return (
    <div className="mx-auto max-w-[1000px]">
      <h1 className="h1">Your plan</h1>
      {a && plan ? (
        <section className="card mt-5 grid gap-4 p-5 md:grid-cols-[1fr_1.2fr]" aria-labelledby="current-plan">
          <div>
            <h2 id="current-plan" className="h3">
              {plan.name}
              {a.comp && <span className="badge ml-2 align-middle">Free pass</span>}
            </h2>
            <p className="mt-1 text-muted">
              {s.daysLeft === 0 ? "Ends today" : `${s.daysLeft} day${s.daysLeft === 1 ? "" : "s"} left`}, until {formatDay(a.ends_at)}
            </p>
            {s.next && (
              <p className="mt-2 text-[14px]">
                Next: <strong>{planById(s.next.plan)?.name}</strong>, from {formatDay(s.next.starts_at)}
              </p>
            )}
          </div>
          <div className="grid gap-3">
            <Usage label="Invoices issued" used={a.invoices_used} limit={a.invoice_limit} />
            <Usage label="AI order reads" used={a.reads_used} limit={a.read_limit} />
          </div>
        </section>
      ) : (
        <p className="mt-2 text-muted">You don't have an active plan. Choose one to start making invoices.</p>
      )}

      {(s.usedUp || s.endingSoon || s.runningLow) && !s.next && (
        <Notice tone="warn" className="mt-4">
          {s.usedUp
            ? "You've used all the invoices in this pass. Buy a new pass to keep going. It starts straight away."
            : s.endingSoon
              ? `Your pass ends on ${formatDay(a!.ends_at)}. Renew now and the new pass starts when this one ends.`
              : `You've used ${a!.invoices_used} of ${a!.invoice_limit} invoices. Upgrade or renew before you run out.`}
        </Notice>
      )}
      {message && (
        <Notice tone={message.tone} role="alert" className="mt-4">
          {message.text}
        </Notice>
      )}

      <h2 className="h3 mt-8">{a ? "Renew or change plan" : "Choose a plan"}</h2>
      <div className="mt-5">
        <PlanCards
          status={status}
          highlight={a ? null : chosenPlan()}
          busy={busy}
          onBuy={async (p) => {
            if ((await buy(p)) && !a) navigate("/");
          }}
        />
      </div>

      <section className="mt-10" aria-labelledby="payments">
        <h2 id="payments" className="h3">
          Payments
        </h2>
        {payments === null ? (
          <p className="mt-2 text-muted">Loading...</p>
        ) : payments.length === 0 ? (
          <p className="mt-2 text-muted">No payments yet.</p>
        ) : (
          <div className="card mt-3 overflow-x-auto" tabIndex={0} role="region" aria-label="Payment history">
            <table className="w-full min-w-[520px] text-left text-[14px]">
              <thead className="text-[12px] uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-2.5 font-semibold">Paid on</th>
                  <th className="px-4 py-2.5 font-semibold">Plan</th>
                  <th className="px-4 py-2.5 font-semibold">Period</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Amount</th>
                  <th className="px-4 py-2.5 font-semibold">Payment ID</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id} className="border-t border-line">
                    <td className="px-4 py-2.5">{p.paid_at ? formatDay(p.paid_at) : ""}</td>
                    <td className="px-4 py-2.5">{planById(p.plan)?.name}</td>
                    <td className="px-4 py-2.5">{p.starts_at && p.ends_at ? `${formatDay(p.starts_at)} to ${formatDay(p.ends_at)}` : ""}</td>
                    <td className="tabular px-4 py-2.5 text-right">{p.status === "comp" ? "Free" : rupees(p.amount_paise / 100)}</td>
                    <td className="px-4 py-2.5 font-mono text-[12px]">{p.razorpay_payment_id ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-[13px] text-muted">
          Questions about a payment? See our <Link to="/refunds" className="underline">refund policy</Link> or{" "}
          <Link to="/contact" className="underline">contact us</Link>.
        </p>
      </section>
    </div>
  );
}

/** Shown on New invoice when there's no pass, or the pass is used up. */
export function ChoosePlan() {
  const { status } = useBilling();
  const { buy, busy, message } = useBuy();
  const s = summarize(status);
  return (
    <div className="mx-auto max-w-[1000px]">
      <div className="flex items-start gap-3">
        <Sparkles className="mt-1 h-6 w-6 shrink-0 text-brand" aria-hidden="true" />
        <div>
          <h1 className="h1">{s.usedUp ? "You've used this pass" : "Choose a plan to start"}</h1>
          <p className="mt-1 text-muted">
            {s.usedUp
              ? `All ${s.active!.invoice_limit} invoices in your ${planById(s.active!.plan)?.name} pass are used. A new pass starts straight away.`
              : "Pick the plan that fits how many orders you get. You can change it every time you renew."}
          </p>
        </div>
      </div>
      {message && (
        <Notice tone={message.tone} role="alert" className="mt-4">
          {message.text}
        </Notice>
      )}
      <div className="mt-6">
        <PlanCards status={status} highlight={s.usedUp ? null : chosenPlan()} busy={busy} onBuy={(p) => void buy(p)} />
      </div>
      <section className="mt-8" aria-labelledby="every-plan">
        <h2 id="every-plan" className="h3">
          Every plan includes
        </h2>
        <ul className="mt-3 grid gap-2 text-[15px] sm:grid-cols-2">
          {PLAN_FEATURES.map((f) => (
            <li key={f} className="flex gap-2">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand" aria-hidden="true" />
              {f}
            </li>
          ))}
        </ul>
        <p className="mt-4 text-[14px] text-muted">
          Your invoices and products stay saved whatever happens to your plan. <Link to="/invoices" className="underline">See your invoices</Link>.
        </p>
      </section>
    </div>
  );
}

/** New invoice and drafts need a pass with invoices left. */
export function RequirePlan({ children }: { children: React.ReactNode }) {
  const { status, error, reload } = useBilling();
  // Check again on every visit: the pass may have ended or been used up since the app opened.
  useEffect(() => {
    void reload();
  }, [reload]);
  if (error) {
    return (
      <div className="mx-auto max-w-[560px]">
        <Notice tone="danger" role="alert">
          {error}
        </Notice>
        <button type="button" className="btn-secondary mt-4" onClick={reload}>
          Try again
        </button>
      </div>
    );
  }
  if (status === undefined) return <PageLoading />;
  return summarize(status).canInvoice ? <>{children}</> : <ChoosePlan />;
}
