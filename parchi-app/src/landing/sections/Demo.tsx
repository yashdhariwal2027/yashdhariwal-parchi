import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import {
  ArrowDown,
  ArrowRight,
  CakeSlice,
  Check,
  CircleCheck,
  ClipboardPaste,
  FileText,
  Gem,
  Gift,
  Minus,
  Plus,
  SendHorizontal,
  Shirt,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  USE_CASES,
  USE_CASE_EVENT,
  formatINR,
  type RevealKey,
  type UseCase,
  type UseCaseId,
} from "@/landing/content/useCases";

const STEP_MS = 500;
const START_DELAY_MS = 400;

const TAB_ICONS: Record<UseCaseId, LucideIcon> = {
  clothing: Shirt,
  jewellery: Gem,
  bakery: CakeSlice,
  gifting: Gift,
};

type Mode = "animated" | "static";
type Status = "idle" | "reading" | "ready" | "sent";

function prefersReducedMotion() {
  return typeof window !== "undefined" && (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false);
}

function detectMode(): Mode {
  if (typeof window === "undefined") return "static";
  return prefersReducedMotion() || !("IntersectionObserver" in window) ? "static" : "animated";
}

/* Stage layout for a use case with n reading steps:
 *   step i: highlight at 2i+1, reveal at 2i+2
 *   totals at 2n+1, "Invoice ready" at 2n+2 (the final stage) */
function finalStage(uc: UseCase) {
  return uc.steps.length * 2 + 2;
}

export function Demo() {
  const [mode, setMode] = useState<Mode>(detectMode);
  const [activeId, setActiveId] = useState<UseCaseId>("clothing");
  const active = useMemo(() => USE_CASES.find((u) => u.id === activeId)!, [activeId]);
  const final = finalStage(active);

  const [stage, setStage] = useState<number>(() => (detectMode() === "static" ? finalStage(USE_CASES[0]) : 0));
  const [running, setRunning] = useState(false);
  const [qty, setQty] = useState<number[]>(() => USE_CASES[0].items.map((i) => i.qty));
  const [sent, setSent] = useState(false);
  const [announcement, setAnnouncement] = useState("");

  const timers = useRef<number[]>([]);
  const stageRef = useRef<HTMLDivElement>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const tabRefs = useRef<Partial<Record<UseCaseId, HTMLButtonElement | null>>>({});
  const started = useRef(false);

  const clearTimers = useCallback(() => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
  }, []);

  const run = useCallback(
    (uc: UseCase, currentMode: Mode) => {
      clearTimers();
      started.current = true;
      const last = finalStage(uc);
      if (currentMode === "static") {
        setRunning(false);
        setStage(last);
        return;
      }
      setStage(0);
      setRunning(true);
      for (let i = 1; i <= last; i++) {
        timers.current.push(
          window.setTimeout(
            () => {
              setStage(i);
              if (i === last) setRunning(false);
            },
            START_DELAY_MS + (i - 1) * STEP_MS,
          ),
        );
      }
    },
    [clearTimers],
  );

  const select = useCallback(
    (id: UseCaseId) => {
      const uc = USE_CASES.find((u) => u.id === id)!;
      setActiveId(id);
      setQty(uc.items.map((i) => i.qty));
      setSent(false);
      setAnnouncement("");
      run(uc, mode);
    },
    [mode, run],
  );

  // First run: once the demo is 25% visible.
  useEffect(() => {
    if (mode !== "animated" || !stageRef.current) return;
    const el = stageRef.current;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          observer.disconnect();
          if (!started.current) run(USE_CASES[0], "animated");
        }
      },
      { threshold: 0.25 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [mode, run]);

  // Reduced motion switched on mid-session: jump to the finished state.
  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!mq) return;
    const onChange = () => {
      if (mq.matches) {
        clearTimers();
        setMode("static");
        setRunning(false);
        setStage(99);
      }
    };
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, [clearTimers]);

  // "See a sample order" buttons elsewhere on the page.
  useEffect(() => {
    const onShow = (e: Event) => {
      const id = (e as CustomEvent<UseCaseId>).detail;
      if (!USE_CASES.some((u) => u.id === id)) return;
      select(id);
      sectionRef.current?.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
      tabRefs.current[id]?.focus({ preventScroll: true });
    };
    window.addEventListener(USE_CASE_EVENT, onShow);
    return () => window.removeEventListener(USE_CASE_EVENT, onShow);
  }, [select]);

  useEffect(() => clearTimers, [clearTimers]);

  function onTabKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    const i = USE_CASES.findIndex((u) => u.id === activeId);
    let next = -1;
    if (e.key === "ArrowRight") next = (i + 1) % USE_CASES.length;
    else if (e.key === "ArrowLeft") next = (i - 1 + USE_CASES.length) % USE_CASES.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = USE_CASES.length - 1;
    if (next < 0) return;
    e.preventDefault();
    const id = USE_CASES[next].id;
    select(id);
    tabRefs.current[id]?.focus();
  }

  const n = active.steps.length;
  const highlighted = new Set(active.steps.filter((_, i) => stage >= 2 * i + 1).map((s) => s.seg));
  const revealed = new Set<RevealKey>(active.steps.filter((_, i) => stage >= 2 * i + 2).map((s) => s.reveal));
  const totalsOn = stage >= 2 * n + 1;
  const ready = stage >= final;
  const status: Status = sent ? "sent" : ready ? "ready" : running ? "reading" : "idle";

  const subtotal = active.items.reduce((sum, item, i) => sum + item.rate * (qty[i] ?? item.qty), 0);
  const total = subtotal + active.delivery;

  function changeQty(index: number, delta: number) {
    const next = [...qty];
    next[index] = Math.min(99, Math.max(1, (next[index] ?? 1) + delta));
    const newSubtotal = active.items.reduce((s, it, i) => s + it.rate * next[i], 0);
    setQty(next);
    setAnnouncement(
      `${active.items[index].name}: quantity ${next[index]}. New total ${formatINR(newSubtotal + active.delivery)}.`,
    );
  }

  function send() {
    setSent(true);
    setAnnouncement(`Invoice ${active.invoiceNo} sent to ${active.customer.name}.`);
  }

  return (
    <section ref={sectionRef} id="demo" aria-labelledby="demo-title" className="pb-12 pt-2 md:pb-16 md:pt-4">
      <div className="wrap">
        <div className="mx-auto max-w-[640px] text-center">
          <h2 id="demo-title" className="h2">
            From chat message to invoice
          </h2>
          <p className="lede mt-3">Paste the message. Check the details. Send the bill.</p>
        </div>

        <div
          role="tablist"
          aria-label="Sample orders"
          className="mx-auto mt-7 grid max-w-[640px] grid-cols-2 gap-1 rounded-card border border-line bg-surface p-1 shadow-card sm:grid-cols-4"
        >
          {USE_CASES.map((uc) => {
            const Icon = TAB_ICONS[uc.id];
            const selected = uc.id === activeId;
            return (
              <button
                key={uc.id}
                ref={(el) => {
                  tabRefs.current[uc.id] = el;
                }}
                id={`demo-tab-${uc.id}`}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-controls="demo-panel"
                tabIndex={selected ? 0 : -1}
                onClick={() => select(uc.id)}
                onKeyDown={onTabKeyDown}
                className={cn(
                  "inline-flex min-h-[44px] items-center justify-center gap-2 whitespace-nowrap rounded-control px-3 text-[14px] font-medium transition-colors",
                  selected ? "bg-brand text-white" : "text-muted hover:bg-alt hover:text-ink",
                )}
              >
                <Icon className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                {uc.tab}
              </button>
            );
          })}
        </div>

        <figure className="mt-6" data-demo-stage={stage} data-demo-final={final} data-demo-case={active.id} data-demo-mode={mode}>
          <figcaption className="sr-only">
            Sample order for {active.seller}: a customer&apos;s chat message turned into invoice {active.invoiceNo} for{" "}
            {formatINR(total)}.
          </figcaption>
          <div className="sr-only" aria-live="polite" aria-atomic="true">
            {announcement}
          </div>

          <div
            ref={stageRef}
            id="demo-panel"
            role="tabpanel"
            aria-labelledby={`demo-tab-${active.id}`}
            className="mx-auto grid max-w-[1040px] items-stretch gap-3 lg:grid-cols-[minmax(0,1fr)_40px_minmax(0,1.12fr)] lg:gap-4"
          >
            <MessageCard key={`m-${active.id}`} uc={active} highlighted={highlighted} pasted={stage >= 1} sent={sent} total={total} />

            <div className="flex items-center justify-center text-muted" aria-hidden="true">
              <ArrowDown className="h-5 w-5 lg:hidden" strokeWidth={1.75} />
              <ArrowRight className="hidden h-5 w-5 lg:block" strokeWidth={1.75} />
            </div>

            <InvoiceCard
              key={`i-${active.id}`}
              uc={active}
              revealed={revealed}
              totalsOn={totalsOn}
              ready={ready}
              status={status}
              qty={qty}
              subtotal={subtotal}
              total={total}
              onQty={changeQty}
              sent={sent}
              onSend={send}
            />
          </div>

          <p className="mt-4 text-center text-[14px] text-muted">
            Interactive preview with sample orders. Change a quantity, then send the invoice.
          </p>
        </figure>
      </div>
    </section>
  );
}

/* ---------------------------------- Message --------------------------------- */

function MessageCard({
  uc,
  highlighted,
  pasted,
  sent,
  total,
}: {
  uc: UseCase;
  highlighted: Set<string>;
  pasted: boolean;
  sent: boolean;
  total: number;
}) {
  return (
    <div className="card demo-boot flex flex-col p-5 sm:p-6">
      <p className="eyebrow">Customer message</p>

      <div className="mt-4 flex items-center gap-3 border-b border-line pb-4">
        <span
          aria-hidden="true"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-alt text-[13px] font-semibold text-muted"
        >
          {uc.customer.initials}
        </span>
        <div className="leading-tight">
          <p className="text-[15px] font-medium text-ink">{uc.customer.name}</p>
          <p className="text-[13px] text-muted">New order</p>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-3 pt-5">
        <div className="relative max-w-[440px] self-start rounded-card rounded-tl-[4px] bg-bubble px-4 pb-7 pt-3 text-[15px] leading-[1.65] text-ink">
          <p>
            {uc.message.map((line, li) => (
              <span key={li} className="block">
                {line.map((part, pi) =>
                  part.seg ? (
                    <span key={pi} className="demo-seg" data-on={highlighted.has(part.seg)}>
                      {part.text}
                    </span>
                  ) : (
                    <span key={pi}>{part.text}</span>
                  ),
                )}
              </span>
            ))}
          </p>
          <span className="absolute bottom-2 right-3 text-[12px] text-muted">{uc.time}</span>
        </div>

        {!sent && (
          <p
            className={cn(
              "flex max-w-[380px] items-center gap-2 self-end rounded-card border border-dashed border-line px-3 py-2.5 text-[13px] text-muted transition-opacity duration-300",
              pasted ? "opacity-100" : "opacity-0",
            )}
            aria-hidden="true"
          >
            <SendHorizontal className="h-4 w-4 shrink-0" strokeWidth={1.75} />
            Your reply with the invoice appears here once you send it.
          </p>
        )}
        {sent && (
          <div className="fade-up max-w-[380px] self-end rounded-card rounded-tr-[4px] border border-line bg-surface p-3 text-[15px] leading-[1.55] text-ink shadow-card" data-testid="demo-reply">
            <div className="flex items-center gap-3 rounded-control border border-line bg-page px-3 py-2">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-control bg-brand-tint text-brand">
                <FileText className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              </span>
              <span className="min-w-0 leading-tight">
                <span className="block truncate font-mono text-[13px] font-medium">{uc.invoiceNo}.pdf</span>
                <span className="tabular block text-[12px] text-muted">Invoice · {formatINR(total)}</span>
              </span>
            </div>
            <p className="mt-2 px-1">{uc.reply}</p>
            <p className="px-1 text-right text-[12px] text-muted">Just now</p>
          </div>
        )}
      </div>

      <div className="mt-5 flex items-center gap-2 border-t border-line pt-4 text-[13px]">
        {pasted ? (
          <>
            <Check className="h-4 w-4 text-brand" strokeWidth={2} aria-hidden="true" />
            <span className="font-medium text-brand">{sent ? "Invoice sent in chat" : "Pasted into Parchi"}</span>
          </>
        ) : (
          <>
            <ClipboardPaste className="h-4 w-4 text-muted" strokeWidth={1.75} aria-hidden="true" />
            <span className="text-muted">Copied from chat</span>
          </>
        )}
      </div>
    </div>
  );
}

/* ---------------------------------- Invoice --------------------------------- */

function Slot({
  active,
  placeholder,
  children,
  className,
}: {
  active: boolean;
  placeholder: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("demo-slot", className)} data-on={active}>
      <div className="demo-placeholder" aria-hidden="true">
        {placeholder}
      </div>
      <div className="demo-real">{children}</div>
    </div>
  );
}

function Bar({ className }: { className?: string }) {
  return <span className={cn("demo-ph-bar h-2.5", className)} />;
}

function QtyStepper({
  name,
  value,
  onChange,
}: {
  name: string;
  value: number;
  onChange: (delta: number) => void;
}) {
  return (
    <span className="inline-flex items-center rounded-control border border-line bg-surface">
      <button
        type="button"
        onClick={() => onChange(-1)}
        disabled={value <= 1}
        aria-label={`Decrease quantity of ${name}`}
        className="flex h-[26px] w-7 items-center justify-center rounded-l-control text-muted transition-colors hover:bg-alt hover:text-ink disabled:opacity-40 disabled:hover:bg-transparent"
      >
        <Minus className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
      </button>
      <span className="tabular w-6 text-center text-[14px] font-medium text-ink" aria-hidden="true">
        {value}
      </span>
      <button
        type="button"
        onClick={() => onChange(1)}
        disabled={value >= 99}
        aria-label={`Increase quantity of ${name}`}
        className="flex h-[26px] w-7 items-center justify-center rounded-r-control text-muted transition-colors hover:bg-alt hover:text-ink disabled:opacity-40"
      >
        <Plus className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
      </button>
    </span>
  );
}

function InvoiceCard({
  uc,
  revealed,
  totalsOn,
  ready,
  status,
  qty,
  subtotal,
  total,
  onQty,
  sent,
  onSend,
}: {
  uc: UseCase;
  revealed: Set<RevealKey>;
  totalsOn: boolean;
  ready: boolean;
  status: Status;
  qty: number[];
  subtotal: number;
  total: number;
  onQty: (index: number, delta: number) => void;
  sent: boolean;
  onSend: () => void;
}) {
  const editable = ready && !sent;
  return (
    <div className="card demo-boot flex flex-col p-5 [animation-delay:120ms] sm:p-6">
      <div className="flex min-h-[20px] items-center justify-between gap-3">
        <p className="eyebrow">Invoice</p>
        <StatusIndicator status={status} />
      </div>

      <div className="mt-4 flex flex-1 flex-col rounded-control border border-line bg-surface p-4 sm:p-5">
        <div className="flex items-start justify-between gap-4 border-b border-line pb-4">
          <p className="text-[16px] font-semibold text-ink">{uc.seller}</p>
          <div className="text-right">
            <p className="font-mono text-[13px] font-medium text-ink">{uc.invoiceNo}</p>
            <p className="tabular text-[13px] text-muted">{uc.date}</p>
          </div>
        </div>

        <Slot
          active={revealed.has("billTo")}
          className="pt-4"
          placeholder={
            <div className="text-[14px] leading-[1.55]">
              <span className="block text-[12px] leading-[1.6]">
                <Bar className="h-2 w-12" />
              </span>
              <span className="block">
                <Bar className="w-28" />
              </span>
              <span className="block">
                <Bar className="w-[70%]" />
              </span>
              <span className="block">
                <Bar className="w-32" />
              </span>
            </div>
          }
        >
          <div className="text-[14px] leading-[1.55]">
            <p className="text-[12px] font-medium uppercase leading-[1.6] tracking-[0.06em] text-muted">Bill to</p>
            <p className="font-medium text-ink">{uc.billTo[0]}</p>
            {uc.billTo.slice(1).map((line) => (
              <p key={line} className="tabular text-muted">
                {line}
              </p>
            ))}
          </div>
        </Slot>

        <div className="mt-4 border-t border-line pt-3">
          <div
            className="hidden grid-cols-[minmax(0,1fr)_88px_72px_80px] gap-3 pb-2 text-[12px] font-medium uppercase tracking-[0.06em] text-muted sm:grid"
            aria-hidden="true"
          >
            <span>Item</span>
            <span className="text-center">Qty</span>
            <span className="text-right">Rate</span>
            <span className="text-right">Amount</span>
          </div>
          <ul className="divide-y divide-line">
            {uc.items.map((item, i) => {
              const q = qty[i] ?? item.qty;
              const qtyNode = editable ? (
                <QtyStepper name={item.name} value={q} onChange={(d) => onQty(i, d)} />
              ) : (
                <span className="tabular">{q}</span>
              );
              return (
                <li key={item.name}>
                  <Slot
                    active={revealed.has(i === 0 ? "item-0" : "item-1")}
                    className="py-2.5"
                    placeholder={
                      <div className="flex items-center justify-between gap-4">
                        <Bar className="w-[45%]" />
                        <Bar className="w-16" />
                      </div>
                    }
                  >
                    {/* Mobile: two lines. sm and up: four columns. */}
                    <div className="text-[14px] leading-[1.5] sm:hidden">
                      <p className="font-medium text-ink">{item.name}</p>
                      <div className="tabular mt-1 flex min-h-[28px] items-center justify-between gap-3 text-muted">
                        <span className="flex items-center gap-1.5">
                          {qtyNode} × {formatINR(item.rate)}
                        </span>
                        <span className="font-medium text-ink">{formatINR(item.rate * q)}</span>
                      </div>
                    </div>
                    <div className="tabular hidden min-h-[28px] grid-cols-[minmax(0,1fr)_88px_72px_80px] items-center gap-3 text-[14px] leading-[1.5] sm:grid">
                      <span className="font-medium text-ink">{item.name}</span>
                      <span className="text-center text-muted">
                        <span className="sr-only">Quantity </span>
                        {qtyNode}
                      </span>
                      <span className="text-right text-muted">
                        <span className="sr-only">at </span>
                        {formatINR(item.rate)}
                      </span>
                      <span className="text-right font-medium text-ink">
                        <span className="sr-only">amount </span>
                        {formatINR(item.rate * q)}
                      </span>
                    </div>
                  </Slot>
                </li>
              );
            })}
          </ul>
        </div>

        {uc.note && (
          <Slot
            active={revealed.has("note")}
            className="mt-1 border-t border-line pt-3"
            placeholder={
              <span className="block text-[14px] leading-[1.55]">
                <Bar className="w-52" />
              </span>
            }
          >
            <p className="text-[14px] leading-[1.55] text-ink">
              <span className="text-muted">{uc.note.label}:</span> {uc.note.value}
            </p>
          </Slot>
        )}

        <Slot
          active={totalsOn}
          className="mt-1 border-t border-line pt-3"
          placeholder={
            <div className="ml-auto flex w-full max-w-[220px] flex-col items-end text-[14px] leading-[1.7]">
              <span className="block">
                <Bar className="w-28" />
              </span>
              <span className="block">
                <Bar className="w-24" />
              </span>
              <span className="block text-[16px]">
                <Bar className="w-32" />
              </span>
            </div>
          }
        >
          <dl className="tabular ml-auto w-full max-w-[220px] text-[14px] leading-[1.7]">
            <div className="flex justify-between gap-6 text-muted">
              <dt>Subtotal</dt>
              <dd>{formatINR(subtotal)}</dd>
            </div>
            <div className="flex justify-between gap-6 text-muted">
              <dt>Delivery</dt>
              <dd>{uc.delivery === 0 ? "Free" : formatINR(uc.delivery)}</dd>
            </div>
            <div className="flex justify-between gap-6 text-[16px] font-semibold text-ink">
              <dt>Total</dt>
              <dd data-testid="demo-total">{formatINR(total)}</dd>
            </div>
          </dl>
        </Slot>

        <Slot
          active={revealed.has("payment")}
          className="mt-3"
          placeholder={
            <span className="block text-[14px] leading-[1.55]">
              <Bar className="w-44" />
            </span>
          }
        >
          <p className="text-[14px] leading-[1.55] text-ink">
            <span className="text-muted">Payment:</span> {uc.payment}
          </p>
        </Slot>
      </div>

      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[13px] text-muted">Prices filled in from your saved product list.</p>
        <Slot
          active={ready}
          placeholder={<Bar className="h-10 w-full rounded-control sm:w-[172px]" />}
          className="sm:shrink-0"
        >
          <button
            type="button"
            onClick={onSend}
            disabled={!ready || sent}
            className={cn(
              "inline-flex min-h-[40px] w-full items-center justify-center gap-2 rounded-control px-4 text-[14px] font-medium transition-colors sm:w-auto",
              sent
                ? "cursor-default border border-line bg-brand-tint text-brand"
                : "bg-brand text-white hover:bg-brand-hover",
            )}
          >
            {sent ? (
              <>
                <Check className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                Sent to customer
              </>
            ) : (
              <>
                <SendHorizontal className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                Send to customer
              </>
            )}
          </button>
        </Slot>
      </div>
    </div>
  );
}

function StatusIndicator({ status }: { status: Status }) {
  if (status === "ready" || status === "sent") {
    return (
      <p key={status} className="demo-status-in flex items-center gap-1.5 text-[13px] font-medium text-brand" data-status={status}>
        <CircleCheck className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
        {status === "sent" ? "Sent" : "Invoice ready"}
      </p>
    );
  }
  return (
    <p className="flex items-center gap-2 text-[13px] text-muted" data-status={status}>
      <span
        aria-hidden="true"
        className={cn("h-1.5 w-1.5 rounded-full", status === "reading" ? "demo-pulse bg-brand" : "bg-[#c9c5bb]")}
      />
      {status === "reading" ? "Reading message…" : "Waiting for message"}
    </p>
  );
}
