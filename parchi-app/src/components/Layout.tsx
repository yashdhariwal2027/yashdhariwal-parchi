import { NavLink, Outlet } from "react-router";
import { FilePlus2, Package, ReceiptText, Settings, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { Wordmark } from "./ui";

const NAV = [
  { to: "/", label: "New invoice", short: "New", icon: FilePlus2, end: true },
  { to: "/invoices", label: "Invoices", short: "Invoices", icon: ReceiptText, end: false },
  { to: "/products", label: "Products", short: "Products", icon: Package, end: false },
  { to: "/plan", label: "Plan", short: "Plan", icon: Wallet, end: false },
  { to: "/settings", label: "Settings", short: "Settings", icon: Settings, end: false },
];

export function Layout() {
  const { business } = useAuth();
  return (
    <div className="min-h-dvh pb-[76px] md:pb-0">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-control focus:bg-surface focus:px-4 focus:py-2 focus:shadow-lift"
      >
        Skip to content
      </a>
      <header className="sticky top-0 z-30 border-b border-line bg-[rgba(247,245,240,0.94)] backdrop-blur">
        <div className="wrap flex h-14 items-center justify-between gap-4 md:h-16">
          <NavLink to="/">
            <Wordmark />
          </NavLink>
          <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
            {NAV.map(({ to, label, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  cn(
                    "rounded-control px-3 py-2 text-[15px] font-medium transition-colors",
                    isActive ? "bg-brand-tint text-brand" : "text-muted hover:bg-alt hover:text-ink",
                  )
                }
              >
                {label}
              </NavLink>
            ))}
          </nav>
          <p className="max-w-[40%] truncate text-[14px] text-muted md:max-w-[220px]" title={business?.name}>
            {business?.name}
          </p>
        </div>
      </header>

      <main id="main" className="wrap py-5 md:py-8">
        <Outlet />
      </main>

      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        <ul className="grid grid-cols-5">
          {NAV.map(({ to, short, icon: Icon, end }) => (
            <li key={to}>
              <NavLink
                to={to}
                end={end}
                className={({ isActive }) =>
                  cn(
                    "flex min-h-[60px] flex-col items-center justify-center gap-1 text-[12px] font-medium",
                    isActive ? "text-brand" : "text-muted",
                  )
                }
              >
                <Icon className="h-5 w-5" strokeWidth={1.9} aria-hidden="true" />
                {short}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
