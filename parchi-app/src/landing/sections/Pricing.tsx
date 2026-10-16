import { Link } from "react-router";
import { Check } from "lucide-react";
import { PLAN_FEATURES, PLANS, rememberPlan } from "@/lib/plans";
import { COMPANY } from "@/landing/company";
import { cn } from "@/lib/utils";

const perInvoice = (price: number, invoices: number) => {
  const v = price / invoices;
  return `₹${v.toFixed(v < 10 ? 2 : 0).replace(/\.00$/, "")}`;
};

export function Pricing({ headingLevel = 2 }: { headingLevel?: 1 | 2 }) {
  const Heading = headingLevel === 1 ? "h1" : "h2";
  return (
    <section id="pricing" aria-labelledby="pricing-title" className="section bg-brand-tint">
      <div className="wrap">
        <div className="mx-auto max-w-[640px] text-center">
          <Heading id="pricing-title" className="h2">
            Simple plans, paid as you go
          </Heading>
          <p className="lede mt-3">Buy a 30-day pass. No auto-renewal, no lock-in. Pick a bigger plan for festive months, a smaller one when it's quiet.</p>
        </div>

        <ul className="mx-auto mt-10 grid max-w-[1040px] gap-4 md:grid-cols-3" aria-label="Plans">
          {PLANS.map((p) => (
            <li
              key={p.id}
              className={cn("card relative flex flex-col p-6", p.popular && "border-brand shadow-[0_0_0_1px_var(--color-brand)]")}
              data-testid={`pricing-${p.id}`}
            >
              {p.popular && (
                <span className="absolute -top-3 left-6 rounded-full bg-brand px-2.5 py-0.5 text-[12px] font-semibold text-white">Most popular</span>
              )}
              <h3 className="text-[20px] font-semibold text-ink">{p.name}</h3>
              <p className="mt-1 text-[15px] text-muted">{p.forWho}</p>
              <p className="mt-5">
                <span className="tabular text-[40px] font-semibold leading-none tracking-tight text-ink">₹{p.price}</span>
                <span className="text-muted"> / 30 days</span>
              </p>
              <p className="mt-2 text-[14px] text-muted">
                That's {perInvoice(p.price, p.invoices)} an invoice if you use them all.
              </p>
              <ul className="mt-5 grid gap-2 text-[15px]">
                <li className="flex gap-2">
                  <Check className="mt-1 h-4 w-4 shrink-0 text-brand" aria-hidden="true" />
                  <span>
                    <strong>{p.invoices}</strong> GST invoices
                  </span>
                </li>
                <li className="flex gap-2">
                  <Check className="mt-1 h-4 w-4 shrink-0 text-brand" aria-hidden="true" />
                  <span>
                    <strong>{p.reads}</strong> AI order reads
                  </span>
                </li>
              </ul>
              <div className="mt-auto pt-6">
                <Link
                  to={`/signin?mode=signup&plan=${p.id}`}
                  onClick={() => rememberPlan(p.id)}
                  className={cn("w-full", p.popular ? "btn-primary" : "btn-secondary")}
                  aria-label={`Get started with ${p.name}, ₹${p.price} for 30 days`}
                >
                  Get started with {p.name}
                </Link>
              </div>
            </li>
          ))}
        </ul>

        <div className="mx-auto mt-10 max-w-[1040px] rounded-card border border-line bg-surface p-6">
          <h3 className="text-[17px] font-semibold text-ink">Every plan includes</h3>
          <ul className="mt-3 grid gap-2 text-[15px] sm:grid-cols-2 lg:grid-cols-3">
            {PLAN_FEATURES.map((f) => (
              <li key={f} className="flex gap-2">
                <Check className="mt-1 h-4 w-4 shrink-0 text-brand" aria-hidden="true" />
                {f}
              </li>
            ))}
          </ul>
        </div>
        <p className="mx-auto mt-5 max-w-[720px] text-center text-[14px] text-muted">
          Pay by UPI, card or netbanking through Razorpay.{" "}
          {COMPANY.gstin ? "Prices include GST." : "Prices are final, no GST added."} Passes aren't refundable once started.{" "}
          <Link to="/refunds" className="underline">
            Cancellation and refund policy
          </Link>
        </p>
      </div>
    </section>
  );
}
