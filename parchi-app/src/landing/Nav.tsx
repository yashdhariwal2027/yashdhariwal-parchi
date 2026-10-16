import { Link, useLocation } from "react-router";
import { useAuth } from "@/lib/auth";
import { Wordmark } from "@/components/ui";

/** On the home page, section links scroll; on other pages they go to the home page section. */
function sectionHref(onHome: boolean, id: string) {
  return onHome ? `#${id}` : `/#${id}`;
}

export function Nav() {
  const { session } = useAuth();
  const onHome = useLocation().pathname === "/";
  const linkCls =
    "hidden min-h-[40px] items-center rounded-control px-3 text-[15px] font-medium text-muted transition-colors hover:text-ink md:inline-flex";
  return (
    <header className="sticky top-0 z-50 border-b border-line bg-page">
      <nav aria-label="Main" className="wrap flex h-16 items-center justify-between gap-3">
        <Link
          to="/"
          onClick={(e) => {
            if (onHome) {
              e.preventDefault();
              window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? "auto" : "smooth" });
            }
          }}
        >
          <Wordmark />
        </Link>
        <div className="flex items-center gap-1 md:gap-2">
          <a href={sectionHref(onHome, "how-it-works")} className={linkCls}>
            How it works
          </a>
          <a href={sectionHref(onHome, "pricing")} className={linkCls}>
            Pricing
          </a>
          <a href={sectionHref(onHome, "faq")} className={linkCls}>
            FAQ
          </a>
          {session ? (
            <Link to="/" className="btn-primary ml-1 min-h-[40px] px-4 text-[14px] md:ml-2">
              Open Parchi
            </Link>
          ) : (
            <>
              <Link to="/signin" className="btn-ghost min-h-[40px] px-3 text-[14px] md:text-[15px]">
                Sign in
              </Link>
              <a href={sectionHref(onHome, "pricing")} className="btn-primary min-h-[40px] px-4 text-[14px]">
                Get started
              </a>
            </>
          )}
        </div>
      </nav>
    </header>
  );
}

function prefersReducedMotion() {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}
