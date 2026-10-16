/*
 * "The 30-second challenge": the visitor fills a sample bill by tapping the right parts of a customer's
 * message, against the clock. Then Parchi does the same in about two seconds and works out the GST.
 *
 * Everything here is hardcoded sample data and runs in the browser: no AI call, no account, nothing saved.
 * The invoice is marked SAMPLE, has a made-up seller and number, and can't be downloaded.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Gem, RotateCcw, Shirt, Timer, Zap, type LucideIcon } from "lucide-react";
import { calculate, type LineInput } from "@/lib/gst/calc";
import { formatPaise } from "@/lib/gst/money";
import { cn } from "@/lib/utils";

type SlotKind = "name" | "delivery" | "item" | "variant" | "payment";

interface Slot {
  /** Which message phrase answers it */
  answer: string;
  kind: SlotKind;
  ask: string;
  /** What appears on the bill once filled */
  shows: string;
  /** For item slots: which line of the bill */
  line?: number;
}

interface Part {
  text: string;
  /** Tappable phrase id */
  id?: string;
  /** What the phrase is, for the hint when it's the wrong one */
  is?: string;
}

interface Order {
  id: string;
  tab: string;
  icon: LucideIcon;
  seller: string;
  sellerState: string;
  customer: string;
  message: Part[][];
  time: string;
  slots: Slot[];
  lines: (LineInput & { label: string })[];
  placeOfSupply: string;
  stateName: string;
  payment: string;
}

const ORDERS: Order[] = [
  {
    id: "kurti",
    tab: "Kurti order",
    icon: Shirt,
    seller: "Sample Kurti House, Delhi",
    sellerState: "07",
    customer: "Meera",
    time: "11:42",
    message: [
      [{ text: "Hi! " }, { text: "2 kurti", id: "k2", is: "the kurti order" }, { text: " chahiye, " }, { text: "pink wala, L size", id: "pinkL", is: "the size and colour" }, { text: " 🙏" }],
      [{ text: "aur " }, { text: "ek dupatta", id: "dup", is: "the dupatta" }, { text: " bhi" }],
      [{ text: "Meera Kapoor", id: "name", is: "the customer's name" }],
      [{ text: "C-42, Lajpat Nagar, Delhi 110024", id: "addr", is: "the delivery address" }],
      [{ text: "98100 12345", id: "phone", is: "the phone number. Parchi reads it on your device and never sends it to the AI" }],
      [{ text: "COD", id: "cod", is: "how they'll pay" }, { text: " chalega?" }],
    ],
    slots: [
      { answer: "name", kind: "name", ask: "Tap the customer's name", shows: "Meera Kapoor" },
      { answer: "addr", kind: "delivery", ask: "Tap where it's going", shows: "C-42, Lajpat Nagar, Delhi 110024" },
      { answer: "k2", kind: "item", ask: "Tap what they want first", shows: "Kurti × 2", line: 0 },
      { answer: "pinkL", kind: "variant", ask: "Tap the size and colour", shows: "Pink, L", line: 0 },
      { answer: "dup", kind: "item", ask: "Tap the second item", shows: "Dupatta × 1", line: 1 },
      { answer: "cod", kind: "payment", ask: "Tap how they'll pay", shows: "Cash on delivery" },
    ],
    lines: [
      { label: "Kurti", name: "Kurti", hsn: "6204", qty: 2, unit: "PCS", price: 1299, discount: 0, gstRate: 5, rateRule: "apparel_2500" },
      { label: "Dupatta", name: "Dupatta", hsn: "6214", qty: 1, unit: "PCS", price: 599, discount: 0, gstRate: 5, rateRule: "apparel_2500" },
    ],
    placeOfSupply: "07",
    stateName: "Delhi",
    payment: "Cash on delivery",
  },
  {
    id: "jhumka",
    tab: "Jewellery, other state",
    icon: Gem,
    seller: "Sample Jhumka Studio, Delhi",
    sellerState: "07",
    customer: "Ananya",
    time: "19:08",
    message: [
      [{ text: "Hello! Wo oxidised jhumke " }, { text: "2 pair", id: "j2", is: "the jhumka order" }, { text: " chahiye" }],
      [{ text: "aur " }, { text: "1 silver payal", id: "payal", is: "the payal" }, { text: " bhi please" }],
      [{ text: "Ananya Rao", id: "name", is: "the customer's name" }],
      [{ text: "14, Indiranagar 2nd Stage, Bengaluru 560038", id: "addr", is: "the delivery address" }],
      [{ text: "UPI kar dungi", id: "upi", is: "how she'll pay" }, { text: ", " }, { text: "9876543210", id: "phone", is: "the phone number. Parchi reads it on your device and never sends it to the AI" }],
    ],
    slots: [
      { answer: "name", kind: "name", ask: "Tap the customer's name", shows: "Ananya Rao" },
      { answer: "addr", kind: "delivery", ask: "Tap where it's going", shows: "14, Indiranagar 2nd Stage, Bengaluru 560038" },
      { answer: "j2", kind: "item", ask: "Tap the jhumke", shows: "Oxidised jhumka × 2 pairs", line: 0 },
      { answer: "payal", kind: "item", ask: "Tap the second item", shows: "Silver payal × 1", line: 1 },
      { answer: "upi", kind: "payment", ask: "Tap how she'll pay", shows: "UPI" },
    ],
    lines: [
      { label: "Oxidised jhumka", name: "Oxidised jhumka", hsn: "7117", qty: 2, unit: "PRS", price: 450, discount: 0, gstRate: 3, rateRule: "fixed" },
      { label: "Silver payal", name: "Silver payal", hsn: "7113", qty: 1, unit: "PCS", price: 1850, discount: 0, gstRate: 3, rateRule: "fixed" },
    ],
    placeOfSupply: "29",
    stateName: "Karnataka",
    payment: "UPI",
  },
];

const PARCHI_MS = 2200;
type Phase = "ready" | "playing" | "parchi" | "done";

function prefersReducedMotion() {
  return typeof window !== "undefined" && (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false);
}

const secs = (ms: number) => `${(ms / 1000).toFixed(1)} s`;

export function Challenge() {
  const [orderId, setOrderId] = useState(ORDERS[0].id);
  const order = ORDERS.find((o) => o.id === orderId)!;
  const [phase, setPhase] = useState<Phase>("ready");
  const [step, setStep] = useState(0);
  const [mistakes, setMistakes] = useState(0);
  const [hint, setHint] = useState<string | null>(null);
  const [wrongId, setWrongId] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState(0);
  const [yourMs, setYourMs] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  const [parchiStep, setParchiStep] = useState(0);
  const [announce, setAnnounce] = useState("");
  const timers = useRef<number[]>([]);

  const clear = () => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
  };
  useEffect(() => clear, []);

  // Running clock while playing.
  useEffect(() => {
    if (phase !== "playing") return;
    const t = window.setInterval(() => setNow(Date.now()), 100);
    return () => window.clearInterval(t);
  }, [phase]);

  function reset(id = orderId) {
    clear();
    setOrderId(id);
    setPhase("ready");
    setStep(0);
    setMistakes(0);
    setHint(null);
    setWrongId(null);
    setYourMs(null);
    setParchiStep(0);
    setAnnounce("");
  }

  function start() {
    reset();
    setPhase("playing");
    const t = Date.now();
    setStartedAt(t);
    setNow(t);
    setAnnounce(`Go! ${order.slots[0].ask} in the message.`);
  }

  function runParchi(you: number | null) {
    clear();
    setYourMs(you);
    setPhase("parchi");
    setStep(order.slots.length);
    const n = order.slots.length + 1; // every slot, then the GST
    if (prefersReducedMotion()) {
      setParchiStep(n);
      setPhase("done");
      return;
    }
    setParchiStep(0);
    for (let i = 1; i <= n; i++) {
      timers.current.push(
        window.setTimeout(() => {
          setParchiStep(i);
          if (i === n) setPhase("done");
        }, (PARCHI_MS / n) * i),
      );
    }
  }

  function tap(part: Part) {
    if (phase !== "playing" || !part.id) return;
    const slot = order.slots[step];
    if (part.id === slot.answer) {
      const next = step + 1;
      setStep(next);
      setHint(null);
      setWrongId(null);
      if (next === order.slots.length) {
        const you = Date.now() - startedAt;
        setAnnounce(`Done in ${secs(you)}. Now watch Parchi do it.`);
        timers.current.push(window.setTimeout(() => runParchi(you), 700));
      } else {
        setAnnounce(`Yes. ${order.slots[next].ask}.`);
      }
    } else {
      setMistakes((m) => m + 1);
      setWrongId(part.id);
      const msg = `That's ${part.is}. ${slot.ask}.`;
      setHint(msg);
      setAnnounce(msg);
      timers.current.push(window.setTimeout(() => setWrongId(null), 450));
    }
  }

  // What's on the bill: while playing, what the visitor has filled; afterwards, what Parchi filled.
  const filledCount = phase === "parchi" || phase === "done" ? Math.min(parchiStep, order.slots.length) : step;
  const filledSlots = order.slots.slice(0, filledCount);
  const has = (kind: SlotKind, line?: number) => filledSlots.some((s) => s.kind === kind && (line === undefined || s.line === line));
  const gstOn = (phase === "parchi" || phase === "done") && parchiStep > order.slots.length;

  const calc = useMemo(
    () =>
      calculate({
        gstStatus: "regular",
        pricesIncludeGst: true,
        sellerStateCode: order.sellerState,
        placeOfSupply: order.placeOfSupply,
        lines: order.lines,
        delivery: 0,
      }),
    [order],
  );

  const elapsed = phase === "playing" ? now - startedAt : yourMs ?? 0;
  const current = phase === "playing" ? order.slots[step] : null;
  const answeredIds = new Set(order.slots.slice(0, step).map((s) => s.answer));

  return (
    <section id="challenge" aria-labelledby="challenge-title" className="section">
      <div className="wrap">
        <div className="mx-auto max-w-[680px] text-center">
          <p className="eyebrow">A quick game</p>
          <h2 id="challenge-title" className="h2 mt-2">
            The 30-second challenge
          </h2>
          <p className="lede mt-3">Can you fill this bill faster than Parchi? Tap the right words in the customer's message. Then watch Parchi do it.</p>
        </div>

        <div role="group" aria-label="Choose an order" className="mx-auto mt-7 grid max-w-[460px] grid-cols-2 gap-1 rounded-card border border-line bg-surface p-1 shadow-card">
          {ORDERS.map((o) => {
            const Icon = o.icon;
            return (
              <button
                key={o.id}
                type="button"
                aria-pressed={o.id === orderId}
                onClick={() => reset(o.id)}
                className={cn(
                  "inline-flex min-h-[44px] items-center justify-center gap-2 rounded-control px-3 text-[14px] font-medium transition-colors",
                  o.id === orderId ? "bg-brand text-white" : "text-muted hover:bg-alt hover:text-ink",
                )}
              >
                <Icon className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                {o.tab}
              </button>
            );
          })}
        </div>

        <div className="sr-only" aria-live="polite" aria-atomic="true">
          {announce}
        </div>

        <div className="mx-auto mt-6 grid max-w-[1040px] gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          {/* Message */}
          <div className="card flex flex-col p-5 sm:p-6" data-testid="challenge-message">
            <div className="flex items-center justify-between gap-3">
              <p className="eyebrow">{order.customer}'s message</p>
              <p className={cn("tabular flex items-center gap-1.5 text-[15px] font-semibold", phase === "playing" ? "text-ink" : "text-muted")} data-testid="challenge-clock">
                <Timer className="h-4 w-4" aria-hidden="true" />
                {secs(elapsed)}
              </p>
            </div>
            <div className="relative mt-4 max-w-[460px] self-start rounded-card rounded-tl-[4px] bg-bubble px-4 pb-7 pt-3 text-[16px] leading-[1.9] text-ink">
              {order.message.map((line, li) => (
                <p key={li}>
                  {line.map((part, pi) =>
                    part.id ? (
                      <button
                        key={pi}
                        type="button"
                        onClick={() => tap(part)}
                        disabled={phase !== "playing" || answeredIds.has(part.id)}
                        className={cn(
                          "rounded px-1 text-left transition-colors [-webkit-box-decoration-break:clone] [box-decoration-break:clone]",
                          answeredIds.has(part.id)
                            ? "bg-highlight"
                            : phase === "playing"
                              ? "cursor-pointer underline decoration-dotted decoration-[#9a9eab] underline-offset-4 hover:bg-alt"
                              : "cursor-default",
                          wrongId === part.id && "challenge-wrong bg-danger-tint",
                        )}
                      >
                        {part.text}
                      </button>
                    ) : (
                      <span key={pi}>{part.text}</span>
                    ),
                  )}
                </p>
              ))}
              <span className="absolute bottom-2 right-3 text-[12px] text-muted">{order.time}</span>
            </div>

            <div className="mt-auto pt-5">
              {phase === "ready" && (
                <div className="flex flex-col gap-2 sm:flex-row">
                  <button type="button" className="btn-primary" onClick={start}>
                    <Timer className="h-4 w-4" aria-hidden="true" />
                    Start the clock
                  </button>
                  <button type="button" className="btn-secondary" onClick={() => runParchi(null)}>
                    Just show me Parchi
                  </button>
                </div>
              )}
              {phase === "playing" && current && (
                <div>
                  <p className="text-[16px] font-semibold text-ink" data-testid="challenge-ask">
                    {step + 1} of {order.slots.length}: {current.ask}
                  </p>
                  <p className={cn("mt-1 min-h-[22px] text-[14px]", hint ? "text-danger" : "text-muted")} data-testid="challenge-hint">
                    {hint ?? "Dotted words can be tapped."}
                  </p>
                </div>
              )}
              {(phase === "parchi" || phase === "done") && (
                <p className="flex items-center gap-2 text-[15px] font-medium text-brand">
                  <Zap className="h-4 w-4" aria-hidden="true" />
                  {phase === "parchi" ? "Parchi is reading the message…" : "Parchi read it, filled the bill and worked out the GST."}
                </p>
              )}
            </div>
          </div>

          {/* Sample bill */}
          <div className="card relative overflow-hidden p-5 sm:p-6" data-testid="challenge-bill">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 flex items-center justify-center text-[64px] font-bold tracking-[0.2em] text-[rgba(200,40,40,0.07)] sm:text-[88px]"
              style={{ transform: "rotate(-24deg)" }}
            >
              SAMPLE
            </div>
            <div className="relative">
              <div className="flex items-start justify-between gap-3 border-b border-line pb-3">
                <div>
                  <p className="text-[15px] font-semibold text-ink">{order.seller}</p>
                  <p className="text-[12px] text-muted">Sample seller, not a real business</p>
                </div>
                <div className="text-right">
                  <p className="text-[13px] font-semibold uppercase tracking-[0.06em] text-ink">Tax invoice</p>
                  <p className="font-mono text-[12px] text-muted">SAMPLE-0001</p>
                </div>
              </div>

              <dl className="mt-3 grid gap-2 text-[14px]">
                <Field label="Bill to" on={has("name")}>
                  {order.slots.find((s) => s.kind === "name")!.shows}
                </Field>
                <Field label="Deliver to" on={has("delivery")}>
                  {order.slots.find((s) => s.kind === "delivery")!.shows}
                </Field>
                <Field label="Place of supply" on={has("delivery")}>
                  {order.stateName} ({order.placeOfSupply})
                </Field>
              </dl>

              <table className="mt-4 w-full text-[14px]">
                <caption className="sr-only">Items on the sample bill</caption>
                <thead className="text-[11px] uppercase tracking-[0.06em] text-muted">
                  <tr className="border-b border-line">
                    <th className="py-1.5 text-left font-medium">Item</th>
                    <th className="py-1.5 text-right font-medium">Qty</th>
                    <th className="py-1.5 text-right font-medium">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {order.lines.map((l, i) => {
                    const on = has("item", i);
                    const variant = order.slots.find((s) => s.kind === "variant" && s.line === i);
                    const varOn = variant ? has("variant", i) : false;
                    return (
                      <tr key={l.label} className="border-b border-line align-top">
                        <td className="py-2">
                          {on ? (
                            <>
                              <span className="font-medium text-ink">{l.label}</span>
                              {variant && <span className={cn("text-muted transition-opacity", varOn ? "opacity-100" : "opacity-0")}>, {variant.shows}</span>}
                              <span className="block text-[12px] text-muted">HSN {l.hsn}</span>
                            </>
                          ) : (
                            <span className="demo-ph-bar h-2.5 w-28" />
                          )}
                        </td>
                        <td className="tabular py-2 text-right">{on ? `${l.qty} ${l.unit}` : ""}</td>
                        <td className="tabular py-2 text-right font-medium">{on ? formatPaise(calc.lines[i].total) : ""}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              <div className={cn("mt-3 transition-opacity duration-300", gstOn ? "opacity-100" : "opacity-0")} aria-hidden={!gstOn} data-testid="challenge-gst">
                <dl className="tabular ml-auto grid max-w-[260px] gap-0.5 text-[14px]">
                  <Row label="Taxable value" value={formatPaise(calc.taxable)} />
                  {calc.intraState ? (
                    <>
                      <Row label="CGST" value={formatPaise(calc.cgst)} />
                      <Row label="SGST" value={formatPaise(calc.sgst)} />
                    </>
                  ) : (
                    <Row label="IGST" value={formatPaise(calc.igst)} />
                  )}
                  <div className="mt-1 flex justify-between border-t border-line pt-1.5 text-[16px] font-semibold text-ink">
                    <dt>Total</dt>
                    <dd>{formatPaise(calc.grandTotal)}</dd>
                  </div>
                </dl>
                <p className="mt-2 text-right text-[12px] text-muted">
                  {calc.intraState ? "Same state as the seller, so CGST + SGST." : `${order.stateName} is another state, so IGST.`}
                </p>
              </div>

              <p className="mt-3 text-[14px]">
                <span className="text-muted">Payment: </span>
                {has("payment") ? order.payment : <span className="demo-ph-bar h-2.5 w-24" />}
              </p>
            </div>
          </div>
        </div>

        {phase === "done" && (
          <div className="fade-up mx-auto mt-5 max-w-[1040px] rounded-card border border-brand bg-brand-tint p-5 sm:p-6" data-testid="challenge-result">
            <div className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-center">
              <div>
                <p className="text-[13px] font-medium uppercase tracking-[0.06em] text-muted">You</p>
                <p className="tabular text-[26px] font-semibold text-ink">{yourMs === null ? "Skipped" : secs(yourMs)}</p>
                {yourMs !== null && (
                  <p className="text-[14px] text-muted">
                    {mistakes === 0 ? "No wrong taps" : `${mistakes} wrong tap${mistakes === 1 ? "" : "s"}`}, and no GST worked out yet
                  </p>
                )}
              </div>
              <div>
                <p className="text-[13px] font-medium uppercase tracking-[0.06em] text-muted">Parchi</p>
                <p className="tabular text-[26px] font-semibold text-brand">{secs(PARCHI_MS)}</p>
                <p className="text-[14px] text-muted">Bill filled, GST split, HSN codes added</p>
              </div>
              <div className="flex flex-col gap-2 sm:items-end">
                <a href="#pricing" className="btn-primary">
                  <Check className="h-4 w-4" aria-hidden="true" />
                  Get Parchi
                </a>
                <button type="button" className="btn-secondary" onClick={() => reset(ORDERS[(ORDERS.findIndex((o) => o.id === orderId) + 1) % ORDERS.length].id)}>
                  <RotateCcw className="h-4 w-4" aria-hidden="true" />
                  Try the other order
                </button>
              </div>
            </div>
            {yourMs !== null && yourMs > PARCHI_MS && (
              <p className="mt-4 text-[15px] text-ink">
                Parchi was <strong>{Math.max(2, Math.round(yourMs / PARCHI_MS))}× faster</strong>, and you had the words handed to you. With a real
                message you'd also type the bill, look up prices and HSN codes, and work out CGST, SGST or IGST.
              </p>
            )}
          </div>
        )}
        <p className="mt-4 text-center text-[14px] text-muted">A game with sample orders. Nothing is sent anywhere, and the sample bill can't be used as an invoice.</p>
      </div>
    </section>
  );
}

function Field({ label, on, children }: { label: string; on: boolean; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[110px_1fr] gap-2">
      <dt className="text-muted">{label}</dt>
      <dd className="text-ink">{on ? children : <span className="demo-ph-bar h-2.5 w-40 max-w-full" />}</dd>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-6 text-muted">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
