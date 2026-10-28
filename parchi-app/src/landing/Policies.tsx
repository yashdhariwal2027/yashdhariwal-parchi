import { useEffect, type ReactNode } from "react";
import { Link } from "react-router";
import { COMPANY, co, reachUs } from "./company";
import { Pricing } from "./sections/Pricing";
import { PLANS } from "@/lib/plans";
import { Nav } from "./Nav";
import { Footer } from "./Footer";

function Page({ title, children }: { title: string; children: ReactNode }) {
  useEffect(() => {
    document.title = `${title} · Parchi`;
    window.scrollTo(0, 0);
    return () => {
      document.title = "Parchi";
    };
  }, [title]);
  return (
    <div className="landing min-h-dvh bg-page">
      <Nav />
      <main id="main" className="wrap py-10 md:py-14">
        <article className="policy mx-auto max-w-[760px]">
          <h1 className="h2">{title}</h1>
          <p className="mt-2 text-[14px] text-muted">Last updated {COMPANY.policiesUpdated}</p>
          <div className="mt-8 grid gap-6">{children}</div>
        </article>
      </main>
      <Footer />
    </div>
  );
}

function S({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="text-[19px] font-semibold tracking-[-0.01em] text-ink">{title}</h2>
      <div className="mt-2 grid gap-2 text-[16px] leading-relaxed text-ink">{children}</div>
    </section>
  );
}

const who = () => `${COMPANY.brand} is run by ${co("legalName")}`;

export function Terms() {
  return (
    <Page title="Terms of Service">
      <p>
        These terms apply when you use {COMPANY.brand} (the website and app at this address). {who()} ("we", "us"). By creating an account or paying
        for a plan, you agree to them.
      </p>
      <S title="What Parchi does">
        <p>
          Parchi helps sellers turn customer order messages into invoices. You paste a message, Parchi reads it with an AI model and fills in an
          invoice draft, and you check, edit and issue it. Parchi works out GST amounts from the details you give it.
        </p>
      </S>
      <S title="You check every invoice">
        <p>
          The AI can misread a message, and GST treatment depends on facts only you know (your registration, your products' HSN codes and rates,
          where goods are delivered). Check every invoice before you issue it. You are responsible for the invoices you issue, for charging the
          right tax and for your GST filings. Parchi is a tool, not tax or legal advice. Ask your CA when unsure.
        </p>
      </S>
      <S title="Your account">
        <p>
          Keep your password safe; you're responsible for what happens in your account. Give true business details. One account is for one business.
        </p>
      </S>
      <S title="Plans and payment">
        <p>
          Parchi is sold as 30-day passes: {PLANS.map((p) => `${p.name} at ₹${p.price} (${p.invoices} invoices, ${p.reads} AI order reads)`).join(", ")}.
          You pay in advance through our payment partner, Dodo Payments. A pass is not renewed or charged automatically. Unused invoices and reads don't carry over to the next
          pass. If you buy a pass while your current one still has invoices left, the new pass starts when the current one ends. If your current pass is
          used up, the new one starts straight away.
        </p>
        <p>
          Prices include GST. Dodo Payments acts as the merchant of record: it sells the pass to you on our behalf, collects the payment,
          charges the GST included in the price and issues your tax invoice.{" "}
          We may change prices for future passes; a pass you've already paid for keeps its price and limits. Refunds are covered in our{" "}
          <Link to="/refunds" className="underline">
            Refund and Cancellation Policy
          </Link>
          .
        </p>
      </S>
      <S title="Fair use">
        <p>
          Don't misuse Parchi: no illegal activity, fake or misleading invoices, attempts to break or overload the service, or reselling access. AI order
          reading is also limited to 150 messages a day per account to keep the service reliable. We may suspend accounts that break these terms.
        </p>
      </S>
      <S title="Your data">
        <p>
          Your business details, products, invoices and customers' details belong to you. We use them only to run Parchi for you, as described in our{" "}
          <Link to="/privacy" className="underline">
            Privacy Policy
          </Link>
          . You can download your invoice register at any time.
        </p>
      </S>
      <S title="Availability">
        <p>
          We work to keep Parchi running, but it may sometimes be unavailable, for example during maintenance or when a provider we rely on (such as
          the AI service) has an outage. You can always fill in an invoice by hand when AI order reading is unavailable.
        </p>
      </S>
      <S title="Liability">
        <p>
          To the extent the law allows, Parchi is provided as it is, and our total liability to you for any claim is limited to the amount you paid us
          for the pass in force when the claim arose. We're not liable for indirect losses such as lost profit, or for tax, penalties or interest
          arising from invoices you issued.
        </p>
      </S>
      <S title="Ending your account">
        <p>
          You can stop using Parchi at any time and ask us to delete your account. We may suspend or close accounts that break these terms.
        </p>
      </S>
      <S title="Law and disputes">
        <p>
          These terms are governed by the laws of India. Courts at {co("city")} have jurisdiction. Please contact us first; most problems are easier to
          sort out directly.
        </p>
      </S>
      <S title="Changes">
        <p>We may update these terms. If a change matters, we'll tell you in the app or by email before it applies.</p>
      </S>
      <S title="Contact">
        <p>
          {co("legalName")}, {co("address")}. Contact: {reachUs()}.
        </p>
      </S>
    </Page>
  );
}

export function Privacy() {
  return (
    <Page title="Privacy Policy">
      <p>
        This policy explains what {COMPANY.brand} collects and why. {who()}, which is responsible for your data under India's Digital Personal Data
        Protection Act, 2023.
      </p>
      <S title="What we collect">
        <p>
          <strong>Your account:</strong> email address and password (stored in hashed form by our database provider).
        </p>
        <p>
          <strong>Your business:</strong> the details you enter in Settings, such as name, address, GSTIN, UPI ID, logo and signature.
        </p>
        <p>
          <strong>Your work:</strong> products, invoices and the customer details on them (names, addresses, phone numbers, GSTINs), and the order
          messages you paste.
        </p>
        <p>
          <strong>Payments:</strong> the plan you bought, the amount, dates and Dodo Payments' payment reference. Card, UPI and bank details are handled by
          Dodo Payments; we never see or store them.
        </p>
      </S>
      <S title="How we use it">
        <p>To run Parchi for you: read orders, make and store invoices, enforce plan limits, take payments and answer support requests. We don't sell your data or use it for advertising.</p>
      </S>
      <S title="AI order reading">
        <p>
          When you tap Read order, the message text and your product names are sent to Google's Gemini API to pick out the order details. Phone numbers
          are removed on your device first and never sent. We use Google's paid API service.
        </p>
      </S>
      <S title="Who processes your data for us">
        <p>
          Supabase (database and sign-in), Cloudflare (hosting), Google (AI order reading), Dodo Payments (payments and tax invoices for your plan) and Microsoft Clarity (site analytics). They process data only to provide their
          service to us. Their servers may be outside India.
        </p>
      </S>
      <S title="Customers' details">
        <p>
          When you put your customers' details on invoices, you decide what's collected and why; we store and process them for you. Only add what an
          invoice needs.
        </p>
      </S>
      <S title="How long we keep it">
        <p>
          As long as your account is open. GST law expects sellers to keep invoices for about six years, so download your invoice register before
          closing your account. When you ask us to delete your account, we delete your data within 30 days, except payment records we must keep by law.
        </p>
      </S>
      <S title="Your rights">
        <p>
          You can ask to see, correct or delete your personal data, or withdraw consent, by writing to us. We'll reply within 30 days. If you're not
          satisfied, you can complain to the Data Protection Board of India.
        </p>
      </S>
      <S title="Cookies and storage">
        <p>Parchi stores your sign-in and any unsaved invoice on your device so you don't lose work. We don't use advertising cookies.</p>
      </S>
      <S title="Site analytics">
        <p>
          We use Microsoft Clarity to see how people use Parchi, through clicks, scrolling and anonymised session recordings, so we can fix confusing
          screens. Clarity sets its own cookies for this. Everything inside your account (invoices, customer details, products and business settings) is
          hidden from these recordings, and typed text is masked. Microsoft's privacy statement explains how it handles this data:
          privacy.microsoft.com/privacystatement.
        </p>
      </S>
      <S title="Security">
        <p>
          Data is sent over encrypted connections. Each seller can only see their own data (enforced in the database). No system is perfectly
          secure; tell us at once if you notice anything wrong.
        </p>
      </S>
      <S title="Grievance officer and contact">
        <p>
          {co("legalName")}, {co("address")}. Contact: {reachUs()}.
        </p>
      </S>
    </Page>
  );
}

export function Refunds() {
  return (
    <Page title="Cancellation and Refund Policy">
      <S title="No automatic renewals">
        <p>
          Every Parchi plan is a prepaid 30-day pass. Nothing renews or charges automatically, so there is no subscription to cancel. Your pass simply
          ends after 30 days unless you buy another.
        </p>
      </S>
      <S title="Refunds">
        <p>
          Passes are not refundable once they have started, including for invoices or days you didn't use. Please choose the plan that fits how many
          orders you get; you can pick a different one each time you buy.
        </p>
        <p>We only refund when a payment goes wrong:</p>
        <ul className="list-disc pl-5">
          <li>
            <strong>Charged but your pass didn't start:</strong> we start it, or refund you in full if you prefer.
          </li>
          <li>
            <strong>Charged twice for the same pass:</strong> the extra payment is refunded in full.
          </li>
        </ul>
      </S>
      <S title="How refunds are paid">
        <p>
          To the same card or UPI account you paid from, through Dodo Payments. Refunds are started within 2 working days of us confirming the
          problem and usually reach you in 5 to 7 working days, depending on your bank.
        </p>
      </S>
      <S title="How to reach us">
        <p>Write to {co("email")} with your account email and the payment ID (shown on the Plan page).</p>
      </S>
    </Page>
  );
}

export function Shipping() {
  return (
    <Page title="Shipping and Delivery Policy">
      <p>
        Parchi is an online service. Nothing is shipped. Your plan is delivered to your Parchi account as soon as your payment is confirmed, usually
        within a minute. If your plan hasn't started within 30 minutes of paying, write to {co("email")} and we'll start it or refund you.
      </p>
    </Page>
  );
}

/** The plans on a page of their own (the payment provider's website check asks for a pricing page). */
export function PricingPage() {
  useEffect(() => {
    document.title = "Pricing · Parchi";
    window.scrollTo(0, 0);
    return () => {
      document.title = "Parchi";
    };
  }, []);
  return (
    <div className="landing min-h-dvh bg-page">
      <Nav />
      <main id="main">
        <Pricing headingLevel={1} />
      </main>
      <Footer />
    </div>
  );
}

export function Contact() {
  return (
    <Page title="Contact us">
      <p>Questions, problems with an invoice or a payment, or ideas for Parchi: we'd like to hear from you.</p>
      <dl className="card grid gap-4 p-5 sm:grid-cols-[160px_1fr]">
        <dt className="font-medium text-muted">Run by</dt>
        <dd>{co("legalName")}</dd>
        <dt className="font-medium text-muted">Email</dt>
        <dd>{COMPANY.email ? <a href={`mailto:${COMPANY.email}`} className="underline">{COMPANY.email}</a> : co("email")}</dd>
        {COMPANY.phone.trim() && (
          <>
            <dt className="font-medium text-muted">Phone</dt>
            <dd>
              <a href={`tel:${COMPANY.phone.replace(/\s/g, "")}`} className="underline">
                {COMPANY.phone}
              </a>
            </dd>
          </>
        )}
        <dt className="font-medium text-muted">Address</dt>
        <dd>{co("address")}</dd>
        {COMPANY.hours.trim() && (
          <>
            <dt className="font-medium text-muted">Hours</dt>
            <dd>{COMPANY.hours}</dd>
          </>
        )}
      </dl>
      <p className="text-[15px] text-muted">Please include your account email so we can find your details quickly.</p>
    </Page>
  );
}
