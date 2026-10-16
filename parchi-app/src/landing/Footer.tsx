import { Link } from "react-router";
import { COMPANY } from "./company";

const LINKS = [
  { to: "/pricing", label: "Pricing" },
  { to: "/terms", label: "Terms" },
  { to: "/privacy", label: "Privacy" },
  { to: "/refunds", label: "Cancellation and refunds" },
  { to: "/shipping", label: "Shipping and delivery" },
  { to: "/contact", label: "Contact" },
];

export function Footer() {
  return (
    <footer className="border-t border-line bg-page">
      <div className="wrap flex flex-col gap-6 py-10 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-[18px] font-bold tracking-[-0.02em] text-ink">Parchi</p>
          <p className="mt-1 text-[14px] text-muted">GST invoices from chat orders, for Indian sellers.</p>
          <nav aria-label="Policies" className="mt-4">
            <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[14px]">
              {LINKS.map((l) => (
                <li key={l.to}>
                  <Link to={l.to} className="text-muted underline-offset-2 hover:text-ink hover:underline">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
        <div className="text-[13px] leading-relaxed text-muted md:text-right">
          <p>
            © 2026 {COMPANY.brand}
            {COMPANY.legalName ? `, run by ${COMPANY.legalName}` : ""}
          </p>
          <p>Payments by Razorpay. Parchi is not affiliated with WhatsApp or Meta.</p>
        </div>
      </div>
    </footer>
  );
}
