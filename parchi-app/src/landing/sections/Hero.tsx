export function Hero() {
  return (
    <section id="top" aria-labelledby="hero-title" className="bg-dots pb-8 pt-12 md:pb-10 md:pt-16">
      <div className="wrap flex flex-col items-center text-center">
        <p className="text-[14px] font-medium text-muted">For sellers who take orders on WhatsApp and Instagram</p>
        <h1
          id="hero-title"
          className="mt-5 max-w-[820px] text-[36px] font-semibold leading-[1.1] tracking-[-0.02em] text-ink md:text-[56px]"
        >
          Stop retyping WhatsApp orders into bills.
        </h1>
        <p className="lede mt-5 max-w-[640px]">
          Paste your customer&apos;s message. Parchi picks out the items, sizes, quantities and delivery details, and
          gives you a clean invoice to send back in seconds.
        </p>
        <div className="mt-7 flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
          <a href="#pricing" className="btn-primary w-full sm:w-auto">
            Get started
          </a>
          <a href="#challenge" className="btn-secondary w-full sm:w-auto">
            Try the 30-second challenge
          </a>
        </div>
        <p className="mt-4 text-[14px] text-muted">GST-ready invoices. Plans from ₹249 for 30 days, no auto-renewal.</p>
      </div>
    </section>
  );
}
