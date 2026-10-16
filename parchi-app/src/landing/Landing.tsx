import { useEffect } from "react";
import { useLocation } from "react-router";
import { Nav } from "./Nav";
import { Footer } from "./Footer";
import { Hero } from "./sections/Hero";
import { Demo } from "./sections/Demo";
import { Challenge } from "./sections/Challenge";
import { Problem } from "./sections/Problem";
import { HowItWorks } from "./sections/HowItWorks";
import { Features } from "./sections/Features";
import { SellerUseCases } from "./sections/SellerUseCases";
import { Pricing } from "./sections/Pricing";
import { Faq } from "./sections/Faq";

export function Landing() {
  const { hash } = useLocation();

  // Arriving from another page at /#pricing (or another section): scroll to it once it's on the page.
  useEffect(() => {
    document.title = "Parchi: GST invoices from WhatsApp orders";
    if (!hash) return;
    const t = window.setTimeout(() => document.getElementById(decodeURIComponent(hash.slice(1)))?.scrollIntoView(), 50);
    return () => window.clearTimeout(t);
  }, [hash]);

  return (
    <div className="landing bg-page">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-control focus:bg-surface focus:px-4 focus:py-2 focus:text-[15px] focus:font-medium focus:text-ink focus:shadow-lift"
      >
        Skip to content
      </a>
      <Nav />
      <main id="main" tabIndex={-1} className="outline-none">
        <Hero />
        <Demo />
        <Challenge />
        <Problem />
        <HowItWorks />
        <Features />
        <SellerUseCases />
        <Pricing />
        <Faq />
      </main>
      <Footer />
    </div>
  );
}
