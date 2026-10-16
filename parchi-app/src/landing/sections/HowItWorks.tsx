import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { CircleCheck, Download, SendHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

const STEPS = [
  {
    n: "01",
    title: "Paste the order",
    body: "Copy the customer's message from WhatsApp or Instagram and paste it in. Your customers don't change a thing.",
    sr: "Preview: the customer's message pasted into Parchi, ready to be read.",
  },
  {
    n: "02",
    title: "Check the details",
    body: "Parchi fills in items, sizes, quantities, prices and the delivery address. Fix anything before you send.",
    sr: "Preview: the order details filled in as editable fields, with the size highlighted for checking.",
  },
  {
    n: "03",
    title: "Send the invoice",
    body: "Download a clean PDF or send it straight back to your customer.",
    sr: "Preview: the finished invoice with options to download the PDF or send it to the customer.",
  },
];

export function HowItWorks() {
  const [active, setActive] = useState(0);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    let next = -1;
    if (e.key === "ArrowDown" || e.key === "ArrowRight") next = (active + 1) % STEPS.length;
    else if (e.key === "ArrowUp" || e.key === "ArrowLeft") next = (active - 1 + STEPS.length) % STEPS.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = STEPS.length - 1;
    if (next < 0) return;
    e.preventDefault();
    setActive(next);
    tabRefs.current[next]?.focus();
  }

  return (
    <section id="how-it-works" aria-labelledby="how-title" className="section on-deep bg-deep text-on-deep">
      <div className="wrap grid items-center gap-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-12">
        <div>
          <h2 id="how-title" className="text-[28px] font-semibold leading-[1.15] tracking-[-0.02em] text-on-deep md:text-[36px]">
            How it works
          </h2>
          <div role="tablist" aria-orientation="vertical" aria-label="Steps" className="mt-7 grid gap-2">
            {STEPS.map((step, i) => {
              const selected = i === active;
              return (
                <button
                  key={step.n}
                  ref={(el) => {
                    tabRefs.current[i] = el;
                  }}
                  id={`how-tab-${i}`}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  aria-controls="how-panel"
                  tabIndex={selected ? 0 : -1}
                  onClick={() => setActive(i)}
                  onKeyDown={onKeyDown}
                  className={cn(
                    "flex w-full gap-4 rounded-card border p-4 text-left transition-colors md:p-5",
                    selected
                      ? "border-deep-line bg-deep-2"
                      : "border-transparent hover:border-deep-line hover:bg-deep-2",
                  )}
                >
                  <span className={cn("tabular pt-0.5 text-[15px] font-semibold", selected ? "text-mint" : "text-on-deep-muted")}>
                    {step.n}
                  </span>
                  <span>
                    <span className="block text-[18px] font-semibold leading-snug tracking-[-0.01em] text-on-deep">
                      {step.title}
                    </span>
                    <span className={cn("mt-1 block text-[15px] leading-[1.6] text-on-deep-muted", !selected && "hidden md:block")}>
                      {step.body}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div id="how-panel" role="tabpanel" aria-labelledby={`how-tab-${active}`}>
          <p className="sr-only">{STEPS[active].sr}</p>
          <AppWindow step={active}>
            <div className="xfade" aria-hidden="true">
              <div data-active={active === 0}>
                <PasteMock />
              </div>
              <div data-active={active === 1}>
                <CheckMock />
              </div>
              <div data-active={active === 2}>
                <SendMock />
              </div>
            </div>
          </AppWindow>
        </div>
      </div>
    </section>
  );
}

function AppWindow({ step, children }: { step: number; children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-card border border-deep-line bg-surface text-ink shadow-lift">
      <div className="flex items-center justify-between gap-3 border-b border-line bg-page px-4 py-3" aria-hidden="true">
        <p className="text-[14px] font-bold tracking-[-0.02em]">
          Parchi <span className="font-normal text-muted">/ New invoice</span>
        </p>
        <div className="flex items-center gap-1.5">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className={cn("h-1.5 rounded-full transition-all", i === step ? "w-5 bg-brand" : "w-1.5 bg-[#d6d0c3]")}
            />
          ))}
        </div>
      </div>
      <div className="p-4 sm:p-6">{children}</div>
    </div>
  );
}

function Field({
  label,
  value,
  highlight,
  hint,
  className,
}: {
  label?: string;
  value: string;
  highlight?: boolean;
  hint?: string;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      {label && <p className="mb-1 text-[12px] font-medium text-muted">{label}</p>}
      <div className="relative">
        <p
          className={cn(
            "truncate rounded-control border bg-surface px-2.5 py-1.5 text-[14px]",
            highlight ? "border-brand ring-2 ring-brand-tint" : "border-line",
          )}
        >
          {value}
        </p>
        {hint && (
          <span className="absolute -top-2.5 right-1.5 whitespace-nowrap rounded bg-highlight px-1.5 text-[11px] font-medium leading-[18px] text-ink">
            {hint}
          </span>
        )}
      </div>
    </div>
  );
}

function PasteMock() {
  return (
    <div className="flex h-full flex-col">
      <p className="text-[13px] font-medium text-muted">Paste customer message</p>
      <div className="mt-2 flex-1 rounded-control border-2 border-dashed border-line bg-page p-4 text-[14px] leading-[1.7]">
        Hi! 2 kurtas chahiye, blue wala, M size.
        <br />
        Aur 1 white dupatta bhi.
        <br />
        Rohini Sharma, H-14, Sector 9, Rohini, Delhi 110085
        <br />
        98XXX XXX12
        <br />
        COD chalega?
        <span className="ml-0.5 inline-block h-4 w-[2px] translate-y-0.5 bg-brand" />
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <span className="rounded-full bg-alt px-3 py-1 text-[12px] font-medium text-muted">Pasted from chat · 5 lines</span>
        <span className="inline-flex min-h-[38px] items-center rounded-control bg-brand px-4 text-[14px] font-medium text-white">
          Read order
        </span>
      </div>
    </div>
  );
}

function CheckMock() {
  return (
    <div className="flex h-full flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Customer" value="Rohini Sharma" />
        <Field label="Phone" value="+91 98XXX XXX12" />
        <div className="sm:col-span-2">
          <Field label="Delivery address" value="H-14, Sector 9, Rohini, Delhi 110085" />
        </div>
      </div>
      <div>
        <p className="mb-1 text-[12px] font-medium text-muted">Items</p>
        <div className="grid gap-2">
          <div className="grid grid-cols-[minmax(0,1fr)_48px_40px] gap-2 sm:grid-cols-[minmax(0,1fr)_48px_40px_72px]">
            <Field value="Kurta, Blue" />
            <Field value="M" highlight hint="M size" />
            <Field value="2" />
            <Field value="₹1,299" className="hidden sm:block" />
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)_48px_40px] gap-2 sm:grid-cols-[minmax(0,1fr)_48px_40px_72px]">
            <Field value="Dupatta, White" />
            <Field value="–" />
            <Field value="1" />
            <Field value="₹599" className="hidden sm:block" />
          </div>
        </div>
      </div>
      <div className="mt-auto flex flex-wrap items-center justify-between gap-3">
        <Field label="Payment" value="Cash on delivery" />
        <span className="inline-flex min-h-[38px] items-center self-end rounded-control bg-brand px-4 text-[14px] font-medium text-white">
          Create invoice
        </span>
      </div>
    </div>
  );
}

function SendMock() {
  return (
    <div className="grid h-full gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)] sm:items-center">
      <div className="rounded-control border border-line bg-surface p-4 shadow-card">
        <div className="flex items-start justify-between border-b border-line pb-3">
          <p className="text-[14px] font-semibold">Noor Studio</p>
          <p className="font-mono text-[12px] font-medium">INV-0142</p>
        </div>
        <div className="tabular space-y-1.5 py-3 text-[13px]">
          <p className="flex justify-between gap-2">
            <span>Kurta, Blue, M × 2</span>
            <span>₹2,598</span>
          </p>
          <p className="flex justify-between gap-2">
            <span>Dupatta, White × 1</span>
            <span>₹599</span>
          </p>
          <p className="flex justify-between gap-2 text-muted">
            <span>Delivery</span>
            <span>₹99</span>
          </p>
        </div>
        <p className="tabular flex justify-between border-t border-line pt-2 text-[14px] font-semibold">
          <span>Total</span>
          <span>₹3,296</span>
        </p>
      </div>
      <div className="grid gap-2">
        <span className="inline-flex min-h-[40px] items-center justify-center gap-2 rounded-control border border-line bg-surface px-4 text-[14px] font-medium">
          <Download className="h-4 w-4" strokeWidth={1.75} />
          Download PDF
        </span>
        <span className="inline-flex min-h-[40px] items-center justify-center gap-2 rounded-control bg-brand px-4 text-[14px] font-medium text-white">
          <SendHorizontal className="h-4 w-4" strokeWidth={1.75} />
          Send to customer
        </span>
        <p className="mt-2 flex items-center gap-2 rounded-control bg-brand-tint px-3 py-2 text-[13px] font-medium text-brand">
          <CircleCheck className="h-4 w-4 shrink-0" strokeWidth={2} />
          INV-0142 sent to Rohini Sharma
        </p>
      </div>
    </div>
  );
}
