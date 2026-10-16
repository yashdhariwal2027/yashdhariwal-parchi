import type { ReactNode } from "react";
import { ArrowRight, FileText, History, MessageSquareText, Tag, type LucideIcon } from "lucide-react";

const FEATURES: { icon: LucideIcon; title: string; body: string; visual: ReactNode }[] = [
  {
    icon: MessageSquareText,
    title: "Reads messy messages",
    body: "Short forms, Hinglish and half sentences, the way customers actually type.",
    visual: <MessyVisual />,
  },
  {
    icon: Tag,
    title: "Your prices, filled in",
    body: "Save your products once. Rates and totals are added automatically.",
    visual: <PricesVisual />,
  },
  {
    icon: FileText,
    title: "Invoices that look professional",
    body: "Your brand name, logo and GSTIN on every bill.",
    visual: <BrandVisual />,
  },
  {
    icon: History,
    title: "Every order in one place",
    body: "Find past invoices and repeat customers without scrolling through chats.",
    visual: <HistoryVisual />,
  },
];

export function Features() {
  return (
    <section aria-labelledby="features-title" className="section">
      <div className="wrap">
        <h2 id="features-title" className="h2 max-w-[640px]">
          Built for the way you already sell
        </h2>
        <ul className="mt-8 grid gap-4 sm:grid-cols-2 md:mt-10 md:gap-5">
          {FEATURES.map(({ icon: Icon, title, body, visual }) => (
            <li key={title} className="card flex flex-col overflow-hidden">
              <div
                className="flex h-[196px] items-center justify-center border-b border-line bg-alt px-4 py-5 sm:px-5"
                aria-hidden="true"
              >
                {visual}
              </div>
              <div className="flex items-start gap-4 p-5 md:p-6">
                <span className="icon-tile" aria-hidden="true">
                  <Icon className="h-5 w-5" strokeWidth={1.75} />
                </span>
                <div>
                  <h3 className="text-[17px] font-semibold leading-snug tracking-[-0.01em] text-ink">{title}</h3>
                  <p className="mt-1.5 text-[16px] leading-[1.6] text-muted">{body}</p>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function Chip({ children, tone = "plain" }: { children: ReactNode; tone?: "plain" | "brand" }) {
  return (
    <span
      className={
        tone === "brand"
          ? "whitespace-nowrap rounded-control border border-[#cfe5da] bg-brand-tint px-2.5 py-1 text-[13px] font-medium text-brand"
          : "whitespace-nowrap rounded-control border border-line bg-surface px-2.5 py-1 font-mono text-[12.5px] text-ink"
      }
    >
      {children}
    </span>
  );
}

function MessyVisual() {
  const rows: [string, string][] = [
    ["2 pc M", "Qty 2 · Size M"],
    ["ek white dupatta", "Dupatta · White · 1"],
    ["cod chalega?", "Cash on delivery"],
  ];
  return (
    <div className="grid w-full max-w-[340px] gap-2.5">
      {rows.map(([from, to]) => (
        <div key={from} className="grid grid-cols-[minmax(0,1fr)_16px_minmax(0,1fr)] items-center gap-2">
          <span className="justify-self-end">
            <Chip>{from}</Chip>
          </span>
          <ArrowRight className="h-4 w-4 text-muted" strokeWidth={1.75} />
          <span className="justify-self-start">
            <Chip tone="brand">{to}</Chip>
          </span>
        </div>
      ))}
    </div>
  );
}

function PricesVisual() {
  const rows: [string, string][] = [
    ["Kurta, Blue", "₹1,299"],
    ["Dupatta, White", "₹599"],
    ["Anarkali set", "₹2,499"],
  ];
  return (
    <div className="w-full max-w-[300px] rounded-control border border-line bg-surface shadow-card">
      <p className="flex items-center justify-between border-b border-line px-3 py-2 text-[12px] font-medium uppercase tracking-[0.06em] text-muted">
        Product list
        <span className="rounded bg-brand-tint px-1.5 py-0.5 text-[11px] normal-case tracking-normal text-brand">Saved</span>
      </p>
      <ul className="tabular divide-y divide-line text-[14px]">
        {rows.map(([name, price]) => (
          <li key={name} className="flex justify-between px-3 py-2">
            <span>{name}</span>
            <span className="font-medium">{price}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function BrandVisual() {
  return (
    <div className="w-full max-w-[300px] rounded-control border border-line bg-surface p-4 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-control bg-[#7a2e3a] text-[13px] font-semibold text-white">
            NS
          </span>
          <div className="leading-tight">
            <p className="text-[14px] font-semibold">Noor Studio</p>
            <p className="whitespace-nowrap font-mono text-[11px] text-muted">GSTIN 07XXXXX0000X1Z5</p>
          </div>
        </div>
        <span className="whitespace-nowrap rounded bg-alt px-1.5 py-0.5 text-[11px] font-medium text-muted">Tax invoice</span>
      </div>
      <div className="mt-3 space-y-2 border-t border-line pt-3">
        <span className="block h-2 w-[80%] rounded-full bg-alt" />
        <span className="block h-2 w-[60%] rounded-full bg-alt" />
        <span className="flex justify-end">
          <span className="h-2 w-16 rounded-full bg-[#dcd6ca]" />
        </span>
      </div>
    </div>
  );
}

function HistoryVisual() {
  const rows: [string, string, string, string][] = [
    ["INV-0142", "Rohini Sharma", "₹3,296", "COD"],
    ["INV-0141", "Meher Kapoor", "₹1,899", "Paid"],
    ["INV-0137", "Rohini Sharma", "₹2,598", "Paid"],
  ];
  return (
    <div className="w-full max-w-[340px] rounded-control border border-line bg-surface shadow-card">
      <ul className="tabular divide-y divide-line text-[13px]">
        {rows.map(([no, name, amount, status], i) => (
          <li key={no} className="grid grid-cols-[70px_minmax(0,1fr)_auto] items-center gap-2 px-3 py-2">
            <span className="font-mono text-[12px] text-muted">{no}</span>
            <span className="truncate">
              {name}
              {i === 2 && (
                <span className="ml-1.5 hidden rounded bg-highlight px-1 text-[11px] font-medium sm:inline">Repeat</span>
              )}
            </span>
            <span className="flex items-center gap-2">
              <span className="font-medium">{amount}</span>
              <span
                className={
                  status === "Paid"
                    ? "rounded bg-brand-tint px-1.5 text-[11px] font-medium text-brand"
                    : "rounded bg-alt px-1.5 text-[11px] font-medium text-muted"
                }
              >
                {status}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
