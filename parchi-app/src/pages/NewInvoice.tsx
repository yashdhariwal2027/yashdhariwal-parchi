import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { ChevronDown, ClipboardPaste, Eye, FileText, Plus, Sparkles, Trash2 } from "lucide-react";
import type { ParseResponse } from "../../api/parse";
import { useAuth, useBusiness } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { createProduct, deleteDraft, getInvoice, issueInvoice, listProducts, nextNumberPreview, saveDraft } from "@/lib/db";
import { friendlyError } from "@/lib/errors";
import {
  blankLine,
  calcDraft,
  checkDraft,
  defaultPlaceOfSupply,
  draftFromParsed,
  draftToRow,
  emptyDraft,
  lineFromProduct,
  productFromLine,
  productNamed,
  rateMissing,
  readyToSaveAsProduct,
  rowToDraft,
  type Issue,
} from "@/lib/invoice/draft";
import { buildDoc } from "@/lib/invoice/doc";
import { GST_RATES, UNITS, type CalcResult, type Unit } from "@/lib/gst/calc";
import { formatPaise, formatRate } from "@/lib/gst/money";
import { STATES } from "@/lib/gst/states";
import { gstinProblem, normalizeGstin } from "@/lib/gst/gstin";
import { todayIST } from "@/lib/gst/dates";
import { PAYMENT_LABELS, type Business, type CheckFlag, type Draft, type DraftLine, type InvoiceRow, type Product } from "@/lib/types";
import { Dialog, Field, Notice, PageLoading, Spinner, useToast } from "@/components/ui";
import { NumberInput } from "@/components/inputs";
import { InvoiceDocument } from "@/components/InvoiceDocument";
import { cn } from "@/lib/utils";

const MAX_CHARS = 4000;

interface WorkInProgress {
  message: string;
  draft: Draft | null;
}

function wipKey(uid: string) {
  return `parchi:wip:${uid}`;
}

function loadWip(uid: string): WorkInProgress | null {
  try {
    const raw = window.localStorage.getItem(wipKey(uid));
    return raw ? (JSON.parse(raw) as WorkInProgress) : null;
  } catch {
    return null;
  }
}

function saveWip(uid: string, wip: WorkInProgress | null) {
  try {
    if (!wip || (!wip.message.trim() && !wip.draft)) window.localStorage.removeItem(wipKey(uid));
    else window.localStorage.setItem(wipKey(uid), JSON.stringify(wip));
  } catch {
    /* storage unavailable: the work just isn't kept across reloads */
  }
}

export function NewInvoice() {
  const biz = useBusiness();
  const { session } = useAuth();
  const uid = session!.user.id;
  const { id: draftId } = useParams();
  const navigate = useNavigate();

  const [products, setProducts] = useState<Product[] | null>(null);
  const [productsError, setProductsError] = useState(false);
  const [message, setMessage] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [loadingDraft, setLoadingDraft] = useState(Boolean(draftId));
  const [draftLoadError, setDraftLoadError] = useState<string | null>(null);

  useEffect(() => {
    listProducts()
      .then(setProducts)
      .catch(() => {
        setProducts([]);
        setProductsError(true);
      });
  }, []);

  // Open a saved draft, or pick up unsaved work from this device.
  useEffect(() => {
    let live = true;
    if (draftId) {
      setLoadingDraft(true);
      getInvoice(draftId)
        .then((row) => {
          if (!live) return;
          if (!row) setDraftLoadError("This draft doesn't exist any more.");
          else if (row.status !== "draft") navigate(`/invoices/${row.id}`, { replace: true });
          else {
            setDraft(rowToDraft(row));
            setMessage("");
          }
        })
        .catch((e) => live && setDraftLoadError(friendlyError(e)))
        .finally(() => live && setLoadingDraft(false));
    } else {
      const wip = loadWip(uid);
      setMessage(wip?.message ?? "");
      setDraft(wip?.draft && !wip.draft.id ? wip.draft : null);
      setLoadingDraft(false);
    }
    return () => {
      live = false;
    };
  }, [draftId, uid, navigate]);

  // Keep unsaved work on this device so a reload or a phone call doesn't lose it.
  useEffect(() => {
    if (draftId || loadingDraft) return;
    saveWip(uid, { message, draft });
  }, [uid, message, draft, draftId, loadingDraft]);

  const startOver = useCallback(() => {
    saveWip(uid, null);
    setMessage("");
    setDraft(null);
    if (draftId) navigate("/", { replace: true });
  }, [uid, draftId, navigate]);

  if (loadingDraft || products === null) return <PageLoading />;
  if (draftLoadError) {
    return (
      <div className="mx-auto max-w-[560px]">
        <Notice tone="danger" role="alert" title="Couldn't open the draft">
          {draftLoadError}
        </Notice>
        <Link to="/" className="btn-secondary mt-4">
          Start a new invoice
        </Link>
      </div>
    );
  }

  if (!draft) {
    return (
      <PasteStep
        message={message}
        setMessage={setMessage}
        products={products}
        productsError={productsError}
        onDraft={setDraft}
        onManual={() => setDraft({ ...emptyDraft(), lines: [blankLine()] })}
      />
    );
  }

  return (
    <Editor
      biz={biz}
      products={products}
      draft={draft}
      setDraft={setDraft as (u: (d: Draft) => Draft) => void}
      message={message}
      onStartOver={startOver}
      onProductsAdded={(added) =>
        setProducts((cur) => [...(cur ?? []), ...added].sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" })))
      }
      onSaved={(id) => {
        saveWip(uid, null);
        if (id !== draftId) navigate(`/drafts/${id}`, { replace: true });
      }}
      onIssued={(row) => {
        saveWip(uid, null);
        navigate(`/invoices/${row.id}`, { state: { justIssued: true } });
      }}
      onDeleted={() => {
        saveWip(uid, null);
        setDraft(null);
        navigate("/", { replace: true });
      }}
    />
  );
}

// ---------------------------------------------------------------------------------------------
// Step 1: paste the message
// ---------------------------------------------------------------------------------------------

function PasteStep({
  message,
  setMessage,
  products,
  productsError,
  onDraft,
  onManual,
}: {
  message: string;
  setMessage: (m: string) => void;
  products: Product[];
  productsError: boolean;
  onDraft: (d: Draft) => void;
  onManual: () => void;
}) {
  const [reading, setReading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notOrder, setNotOrder] = useState(false);
  const active = products.filter((p) => !p.archived);
  const tooLong = message.length > MAX_CHARS;

  async function read() {
    setError(null);
    setNotOrder(false);
    if (!message.trim()) {
      setError("Paste the customer's message first.");
      return;
    }
    if (tooLong) return;
    setReading(true);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("not_signed_in");
      const res = await fetch("/api/parse", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ message, catalogue: active.map((p) => ({ id: p.id, name: p.name, aliases: p.aliases })) }),
        signal: AbortSignal.timeout(60_000),
      });
      const body = (await res.json().catch(() => null)) as ParseResponse | null;
      if (!body) {
        setError("Order reading isn't available right now. You can fill the invoice by hand.");
        return;
      }
      if (!body.ok) {
        setError(body.message);
        return;
      }
      const o = body.order;
      if (!o.isOrder || (o.items.length === 0 && !o.customerName && !o.address)) {
        setNotOrder(true);
        return;
      }
      const d = draftFromParsed(o, message, products);
      if (d.lines.length === 0) d.lines = [{ ...blankLine(), checks: [{ field: "product", reason: "No items found. Add what they ordered" }] }];
      onDraft(d);
    } catch (e) {
      const name = (e as Error)?.name;
      if (name === "TimeoutError" || name === "AbortError") setError("Reading took too long. Try again.");
      else if ((e as Error)?.message === "not_signed_in") setError("Your session has ended. Please sign in again.");
      else setError(friendlyError(e, "Couldn't read this message. Try again, or fill the invoice by hand."));
    } finally {
      setReading(false);
    }
  }

  async function pasteFromClipboard() {
    try {
      const text = await navigator.clipboard.readText();
      if (text) setMessage(text);
    } catch {
      /* permission denied: the seller can long-press and paste instead */
    }
  }

  return (
    <div className="mx-auto max-w-[680px]">
      <h1 className="h1">New invoice</h1>
      <p className="mt-1 text-muted">Copy the customer's order message from WhatsApp or Instagram and paste it here.</p>

      {productsError && (
        <Notice tone="warn" className="mt-4">
          Couldn't load your products, so prices won't be filled in. Check your connection and reload.
        </Notice>
      )}
      {!productsError && active.length === 0 && (
        <Notice tone="info" className="mt-4" title="Add your products first">
          Parchi fills in prices, HSN codes and GST from your product list.{" "}
          <Link to="/products" className="font-medium text-brand underline underline-offset-2">
            Add products
          </Link>
        </Notice>
      )}

      <div className="card mt-5 p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <label htmlFor="order-message" className="label mb-0">
            Customer's message
          </label>
          {"clipboard" in navigator && "readText" in (navigator.clipboard ?? {}) && (
            <button type="button" className="btn-ghost btn-sm" onClick={pasteFromClipboard}>
              <ClipboardPaste className="h-4 w-4" aria-hidden="true" />
              Paste
            </button>
          )}
        </div>
        <textarea
          id="order-message"
          className="input mt-2 min-h-[200px] font-[inherit]"
          placeholder={"Hi! 2 kurtas chahiye, blue wala, M size.\nRohini Sharma, H-14, Sector 9, Rohini, Delhi 110085\n98XXX XXX12\nCOD chalega?"}
          value={message}
          onChange={(e) => {
            setMessage(e.target.value);
            setError(null);
            setNotOrder(false);
          }}
          aria-describedby="order-message-hint"
          aria-invalid={tooLong || undefined}
        />
        <p id="order-message-hint" className={cn("hint", tooLong && "font-medium text-danger")}>
          {tooLong
            ? `That's ${message.length.toLocaleString("en-IN")} characters. Paste up to ${MAX_CHARS.toLocaleString("en-IN")}.`
            : "Phone numbers are read on your phone and are never sent to the AI."}
        </p>

        <div aria-live="polite">
          {error && (
            <Notice tone="danger" className="mt-4">
              {error}
            </Notice>
          )}
          {notOrder && (
            <Notice tone="warn" className="mt-4" title="This doesn't look like an order">
              Parchi couldn't find any items or delivery details. Check you pasted the right message, or fill in the invoice by hand.
            </Notice>
          )}
        </div>

        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <button type="button" className="btn-primary sm:min-w-[160px]" onClick={read} disabled={reading || tooLong}>
            {reading ? (
              <Spinner label="Reading the order..." />
            ) : (
              <>
                <Sparkles className="h-4 w-4" aria-hidden="true" />
                Read order
              </>
            )}
          </button>
          <button type="button" className="btn-secondary" onClick={onManual} disabled={reading}>
            Fill in by hand
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Step 2: check and edit
// ---------------------------------------------------------------------------------------------

function CheckNote({ flag, onConfirm }: { flag: CheckFlag; onConfirm: () => void }) {
  return (
    <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] leading-snug">
      <span className="rounded bg-highlight px-1.5 py-px text-[12px] font-semibold text-ink">Check</span>
      <span className="text-ink">{flag.reason}</span>
      <button type="button" className="font-medium text-brand underline underline-offset-2" onClick={onConfirm}>
        Looks right
      </button>
    </p>
  );
}

function Editor({
  biz,
  products,
  draft,
  setDraft,
  message,
  onStartOver,
  onProductsAdded,
  onSaved,
  onIssued,
  onDeleted,
}: {
  biz: Business;
  products: Product[];
  draft: Draft;
  setDraft: (u: (d: Draft) => Draft) => void;
  message: string;
  onStartOver: () => void;
  onProductsAdded: (added: Product[]) => void;
  onSaved: (id: string) => void;
  onIssued: (row: InvoiceRow) => void;
  onDeleted: () => void;
}) {
  const toast = useToast();
  const [posManual, setPosManual] = useState(false);
  const [showMessage, setShowMessage] = useState(true);
  const [preview, setPreview] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [nextNo, setNextNo] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | "save" | "issue" | "delete">(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [triedIssue, setTriedIssue] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const summaryRef = useRef<HTMLDivElement>(null);

  const regular = biz.gst_status === "regular";
  const registered = biz.gst_status !== "unregistered";
  const active = useMemo(() => products.filter((p) => !p.archived), [products]);
  const calc = useMemo(() => calcDraft(draft, biz), [draft, biz]);
  const issues = useMemo(() => checkDraft(draft, biz, calc), [draft, biz, calc]);
  const blocks = issues.filter((i) => i.level === "block");
  const warns = issues.filter((i) => i.level === "warn");
  const flagFor = (field: string) => draft.checks.find((c) => c.field === field);
  const errFor = (field: string, lineKey?: string) =>
    triedIssue ? blocks.find((b) => b.field === field && (lineKey === undefined || b.lineKey === lineKey))?.message ?? null : null;

  // ----- updates -----
  const patch = (p: Partial<Draft>, clears: string[] = []) =>
    setDraft((d) => ({ ...d, ...p, checks: clears.length ? d.checks.filter((c) => !clears.includes(c.field)) : d.checks }));

  const confirmTop = (field: string) => setDraft((d) => ({ ...d, checks: d.checks.filter((c) => c.field !== field) }));

  const patchLine = (key: string, p: Partial<DraftLine>, clears: string[] = []) =>
    setDraft((d) => ({
      ...d,
      lines: d.lines.map((l) => (l.key === key ? { ...l, ...p, checks: l.checks.filter((c) => !clears.includes(c.field)) } : l)),
    }));

  const confirmLine = (key: string, field: string) =>
    setDraft((d) => ({ ...d, lines: d.lines.map((l) => (l.key === key ? { ...l, checks: l.checks.filter((c) => c.field !== field) } : l)) }));

  function setDeliveryState(code: string | null) {
    setDraft((d) => ({
      ...d,
      customerStateCode: code,
      placeOfSupply: posManual ? d.placeOfSupply : defaultPlaceOfSupply(code, d.customerGstin),
      checks: d.checks.filter((c) => c.field !== "customerState"),
    }));
  }

  function setGstin(raw: string) {
    const g = normalizeGstin(raw);
    setDraft((d) => ({
      ...d,
      customerGstin: g,
      placeOfSupply: posManual ? d.placeOfSupply : defaultPlaceOfSupply(d.customerStateCode, g),
      checks: d.checks.filter((c) => c.field !== "customerGstin"),
    }));
  }

  function chooseProduct(key: string, productId: string) {
    const p = active.find((x) => x.id === productId);
    setDraft((d) => ({
      ...d,
      lines: d.lines.map((l) => {
        if (l.key !== key) return l;
        if (!p) return { ...l, productId: null, checks: l.checks.filter((c) => c.field !== "product") };
        const fresh = lineFromProduct(p, l.qty);
        return { ...fresh, key: l.key, variant: l.variant, discount: l.discount, checks: l.checks.filter((c) => c.field !== "product" && c.field !== "price") };
      }),
    }));
  }

  // ----- actions -----
  async function persist(): Promise<string> {
    // "Save to my products": add each ticked item (or link to a product with the same name) before saving.
    const made: Product[] = [];
    const linkedTo = new Map<string, string>();
    try {
      for (const l of draft.lines) {
        if (!readyToSaveAsProduct(l, biz)) continue;
        let p = productNamed(l.name, [...active, ...made]);
        if (!p) {
          const saved = await createProduct(productFromLine(l));
          p = { ...saved, price: Number(saved.price), gst_rate: Number(saved.gst_rate) };
          made.push(p);
        }
        linkedTo.set(l.key, p.id);
      }
    } finally {
      if (made.length) onProductsAdded(made);
    }
    const link = (l: DraftLine): DraftLine => (linkedTo.has(l.key) ? { ...l, productId: linkedTo.get(l.key)!, saveAsProduct: false } : l);
    const toSave = { ...draft, lines: draft.lines.map(link) };
    const row = await saveDraft(draft.id, draftToRow(toSave, biz));
    setDraft((d) => ({ ...d, id: row.id, lines: d.lines.map(link) }));
    if (made.length) toast(made.length === 1 ? `${made[0].name} added to your products` : `${made.length} items added to your products`);
    return row.id;
  }

  async function onSave() {
    setActionError(null);
    setBusy("save");
    try {
      const id = await persist();
      toast("Draft saved");
      onSaved(id);
    } catch (e) {
      setActionError(friendlyError(e, "Couldn't save the draft. Please try again."));
    } finally {
      setBusy(null);
    }
  }

  async function startIssue() {
    setTriedIssue(true);
    setActionError(null);
    if (blocks.length) {
      summaryRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    setNextNo(null);
    setConfirming(true);
    nextNumberPreview(biz.invoice_prefix, draft.issueDate)
      .then(setNextNo)
      .catch(() => setNextNo(null));
  }

  async function onIssue() {
    setBusy("issue");
    setActionError(null);
    try {
      const id = await persist();
      const row = await issueInvoice(id);
      setConfirming(false);
      onIssued(row);
    } catch (e) {
      setActionError(friendlyError(e, "Couldn't issue the invoice. Please try again."));
    } finally {
      setBusy(null);
    }
  }

  async function onDelete() {
    if (!draft.id) return;
    setBusy("delete");
    try {
      await deleteDraft(draft.id);
      toast("Draft deleted");
      onDeleted();
    } catch (e) {
      setActionError(friendlyError(e));
      setConfirmDelete(false);
    } finally {
      setBusy(null);
    }
  }

  const previewDoc = useMemo(() => {
    if (!preview) return null;
    const w = draftToRow(draft, biz);
    const row = {
      ...w,
      id: draft.id ?? "preview",
      user_id: biz.user_id,
      status: "draft",
      invoice_no: null,
      fy: null,
      seq: null,
      payment_status: "unpaid",
      paid_at: null,
      seller: null,
      issued_at: null,
      cancel_reason: null,
      cancelled_at: null,
      created_at: "",
      updated_at: "",
    } as InvoiceRow;
    return buildDoc(row, biz);
  }, [preview, draft, biz]);

  const unresolved = draft.checks.length + draft.lines.reduce((s, l) => s + l.checks.length, 0);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="h1">{draft.id ? "Edit draft" : "Check the details"}</h1>
          <p className="mt-1 text-muted">
            {unresolved > 0
              ? `Parchi wasn't sure about ${unresolved === 1 ? "1 detail" : `${unresolved} details`}. They're highlighted below.`
              : "Everything can be changed until you issue the invoice."}
          </p>
        </div>
        <div className="flex gap-2">
          {draft.id && (
            <button type="button" className="btn-ghost btn-sm text-danger" onClick={() => setConfirmDelete(true)}>
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              Delete draft
            </button>
          )}
          <button type="button" className="btn-secondary btn-sm" onClick={onStartOver}>
            New invoice
          </button>
        </div>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
        <div className="grid gap-5">
          {message.trim() && (
            <section className="card overflow-hidden" aria-label="Customer's message">
              <button
                type="button"
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-[14px] font-medium sm:px-5"
                aria-expanded={showMessage}
                onClick={() => setShowMessage((v) => !v)}
              >
                Customer's message
                <ChevronDown className={cn("h-4 w-4 text-muted transition-transform", showMessage && "rotate-180")} aria-hidden="true" />
              </button>
              {showMessage && (
                <div className="border-t border-line bg-bubble px-4 py-3 sm:px-5">
                  <p className="whitespace-pre-wrap break-words text-[14px] leading-[1.6]">{message}</p>
                </div>
              )}
            </section>
          )}

          {/* Customer */}
          <section className="card grid gap-4 p-4 sm:p-5" aria-labelledby="sec-customer">
            <h2 id="sec-customer" className="h3">
              Customer
            </h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Name" error={errFor("customerName")}>
                {(p) => (
                  <>
                    <input
                      {...p}
                      className={cn("input", flagFor("customerName") && "needs-check")}
                      value={draft.customerName}
                      autoComplete="off"
                      onChange={(e) => patch({ customerName: e.target.value }, ["customerName"])}
                    />
                    {flagFor("customerName") && <CheckNote flag={flagFor("customerName")!} onConfirm={() => confirmTop("customerName")} />}
                  </>
                )}
              </Field>
              <Field label="Phone" optional>
                {(p) => (
                  <>
                    <input
                      {...p}
                      className={cn("input", flagFor("customerPhone") && "needs-check")}
                      type="tel"
                      autoComplete="off"
                      value={draft.customerPhone}
                      onChange={(e) => patch({ customerPhone: e.target.value }, ["customerPhone"])}
                    />
                    {flagFor("customerPhone") && <CheckNote flag={flagFor("customerPhone")!} onConfirm={() => confirmTop("customerPhone")} />}
                  </>
                )}
              </Field>
              <Field label="Delivery address" className="sm:col-span-2" error={errFor("customerAddress")} optional={!regular}>
                {(p) => (
                  <textarea
                    {...p}
                    rows={2}
                    className="input"
                    value={draft.customerAddress}
                    onChange={(e) => patch({ customerAddress: e.target.value })}
                  />
                )}
              </Field>
              <Field label="Delivery state" error={errFor("customerState")}>
                {(p) => (
                  <>
                    <select
                      {...p}
                      className={cn("input", flagFor("customerState") && "needs-check")}
                      value={draft.customerStateCode ?? ""}
                      onChange={(e) => setDeliveryState(e.target.value || null)}
                    >
                      <option value="">Choose state</option>
                      {STATES.map((s) => (
                        <option key={s.code} value={s.code}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                    {flagFor("customerState") && <CheckNote flag={flagFor("customerState")!} onConfirm={() => confirmTop("customerState")} />}
                  </>
                )}
              </Field>
              {registered && (
                <Field
                  label="Customer's GSTIN"
                  optional
                  hint="Only for business customers who want to claim GST."
                  error={
                    errFor("customerGstin") ??
                    (draft.customerGstin.length === 15 && gstinProblem(draft.customerGstin) ? "This GSTIN doesn't look right." : null)
                  }
                >
                  {(p) => (
                    <>
                      <input
                        {...p}
                        className={cn("input font-mono uppercase", flagFor("customerGstin") && "needs-check")}
                        maxLength={15}
                        spellCheck={false}
                        autoCapitalize="characters"
                        value={draft.customerGstin}
                        onChange={(e) => setGstin(e.target.value)}
                      />
                      {flagFor("customerGstin") && <CheckNote flag={flagFor("customerGstin")!} onConfirm={() => confirmTop("customerGstin")} />}
                    </>
                  )}
                </Field>
              )}
              {regular && (
                <Field
                  label="Place of supply"
                  error={errFor("placeOfSupply")}
                  hint={
                    draft.placeOfSupply
                      ? draft.placeOfSupply === biz.state_code
                        ? "Same state as you, so CGST + SGST."
                        : "Different state from you, so IGST."
                      : "Usually the delivery state."
                  }
                >
                  {(p) => (
                    <select
                      {...p}
                      className="input"
                      value={draft.placeOfSupply ?? ""}
                      onChange={(e) => {
                        setPosManual(true);
                        patch({ placeOfSupply: e.target.value || null });
                      }}
                    >
                      <option value="">Choose state</option>
                      {STATES.map((s) => (
                        <option key={s.code} value={s.code}>
                          {s.name} ({s.code})
                        </option>
                      ))}
                    </select>
                  )}
                </Field>
              )}
            </div>
          </section>

          {/* Items */}
          <section className="card p-4 sm:p-5" aria-labelledby="sec-items">
            <h2 id="sec-items" className="h3">
              Items
            </h2>
            <ul className="mt-3 grid gap-3">
              {draft.lines.map((l, i) => (
                <li key={l.key}>
                  <ItemEditor
                    line={l}
                    index={i}
                    count={draft.lines.length}
                    biz={biz}
                    products={active}
                    result={calc.lines[i]}
                    errFor={(f) => errFor(f, l.key)}
                    onPatch={(p, clears) => patchLine(l.key, p, clears)}
                    onConfirm={(f) => confirmLine(l.key, f)}
                    onChooseProduct={(pid) => chooseProduct(l.key, pid)}
                    onRemove={() => setDraft((d) => ({ ...d, lines: d.lines.filter((x) => x.key !== l.key) }))}
                  />
                </li>
              ))}
            </ul>
            {triedIssue && blocks.some((b) => b.code === "no_items") && (
              <p className="field-error">Add at least one item.</p>
            )}
            <button
              type="button"
              className="btn-secondary btn-sm mt-3"
              onClick={() => setDraft((d) => ({ ...d, lines: [...d.lines, blankLine()] }))}
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              Add item
            </button>
          </section>

          {/* Other details */}
          <section className="card grid gap-4 p-4 sm:p-5" aria-labelledby="sec-more">
            <h2 id="sec-more" className="h3">
              Delivery and payment
            </h2>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Delivery charge" hint={regular && biz.prices_include_gst ? "Including GST" : undefined}>
                {(p) => <NumberInput {...p} rupee value={draft.delivery} onValue={(n) => patch({ delivery: n })} />}
              </Field>
              <Field label="Payment">
                {(p) => (
                  <select
                    {...p}
                    className="input"
                    value={draft.paymentMode}
                    onChange={(e) => patch({ paymentMode: e.target.value as Draft["paymentMode"] })}
                  >
                    <option value="">Not specified</option>
                    {Object.entries(PAYMENT_LABELS).map(([v, label]) => (
                      <option key={v} value={v}>
                        {label}
                      </option>
                    ))}
                  </select>
                )}
              </Field>
              <Field label="Invoice date" error={errFor("issueDate")}>
                {(p) => (
                  <input
                    {...p}
                    type="date"
                    className="input"
                    max={todayIST()}
                    value={draft.issueDate}
                    onChange={(e) => patch({ issueDate: e.target.value || todayIST() })}
                  />
                )}
              </Field>
              <Field label="Note on the invoice" optional className="sm:col-span-3" hint="For example: Deliver on Saturday. Gift wrap.">
                {(p) => (
                  <input {...p} className="input" maxLength={1000} value={draft.notes} onChange={(e) => patch({ notes: e.target.value })} />
                )}
              </Field>
            </div>
          </section>
        </div>

        {/* Summary */}
        <aside className="lg:sticky lg:top-24" aria-labelledby="sec-summary">
          <div ref={summaryRef} className="card p-4 sm:p-5">
            <h2 id="sec-summary" className="h3">
              Summary
            </h2>
            <Totals calc={calc} biz={biz} />

            {triedIssue && blocks.length > 0 && (
              <div className="mt-4" role="alert">
                <Notice tone="danger" title="Before you issue">
                  <ul className="list-disc pl-4">
                    {blocks.map((b, i) => (
                      <li key={i}>{b.message}</li>
                    ))}
                  </ul>
                </Notice>
              </div>
            )}
            {warns.length > 0 && (
              <div className="mt-4 grid gap-2">
                {warns.map((w) => (
                  <Notice key={w.code} tone="warn">
                    {w.message}
                  </Notice>
                ))}
              </div>
            )}
            {actionError && !confirming && (
              <Notice tone="danger" role="alert" className="mt-4">
                {actionError}
              </Notice>
            )}

            <div className="mt-5 grid gap-2">
              <button type="button" className="btn-primary w-full" onClick={startIssue} disabled={busy !== null}>
                <FileText className="h-4 w-4" aria-hidden="true" />
                Issue invoice
              </button>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" className="btn-secondary" onClick={() => setPreview(true)}>
                  <Eye className="h-4 w-4" aria-hidden="true" />
                  Preview
                </button>
                <button type="button" className="btn-secondary" onClick={onSave} disabled={busy !== null}>
                  {busy === "save" ? <Spinner label="Saving..." /> : "Save draft"}
                </button>
              </div>
            </div>
            <IssuesHint blocks={blocks} triedIssue={triedIssue} />
          </div>
        </aside>
      </div>

      <Dialog open={preview} onClose={() => setPreview(false)} title="Preview" wide>
        {previewDoc && <InvoiceDocument doc={previewDoc} />}
      </Dialog>

      <Dialog
        open={confirming}
        onClose={() => busy !== "issue" && setConfirming(false)}
        title="Issue this invoice?"
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setConfirming(false)} disabled={busy === "issue"}>
              Not yet
            </button>
            <button type="button" className="btn-primary" onClick={onIssue} disabled={busy === "issue"}>
              {busy === "issue" ? <Spinner label="Issuing..." /> : "Issue invoice"}
            </button>
          </>
        }
      >
        <p>
          It will get the next number in your series
          {nextNo ? (
            <>
              , <span className="font-mono font-medium">{nextNo}</span>
            </>
          ) : null}
          , for <span className="font-semibold">{formatPaise(calc.grandTotal)}</span> to {draft.customerName.trim()}.
        </p>
        <p className="mt-2 text-muted">Once issued, an invoice can't be edited. If something's wrong later, you can cancel it.</p>
        {actionError && confirming && (
          <Notice tone="danger" role="alert" className="mt-3">
            {actionError}
          </Notice>
        )}
      </Dialog>

      <Dialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete this draft?"
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setConfirmDelete(false)}>
              Keep it
            </button>
            <button type="button" className="btn-danger" onClick={onDelete} disabled={busy === "delete"}>
              {busy === "delete" ? <Spinner label="Deleting..." /> : "Delete draft"}
            </button>
          </>
        }
      >
        <p>The draft will be removed. This can't be undone.</p>
      </Dialog>

      {/* Phones: total and the main action stay in reach */}
      <div className="fixed inset-x-0 bottom-[calc(60px+env(safe-area-inset-bottom))] z-20 border-t border-line bg-surface px-4 py-2.5 lg:hidden">
        <div className="mx-auto flex max-w-[1168px] items-center justify-between gap-3">
          <div>
            <p className="text-[12px] text-muted">Total</p>
            <p className="tabular text-[18px] font-semibold leading-tight" data-testid="mobile-total">
              {formatPaise(calc.grandTotal)}
            </p>
          </div>
          <button type="button" className="btn-primary" onClick={startIssue} disabled={busy !== null}>
            Issue invoice
          </button>
        </div>
      </div>
      <div className="h-[72px] lg:hidden" aria-hidden="true" />
    </div>
  );
}

function IssuesHint({ blocks, triedIssue }: { blocks: Issue[]; triedIssue: boolean }) {
  if (triedIssue || blocks.length === 0) return null;
  return <p className="mt-3 text-center text-[13px] text-muted">Parchi checks GST details before issuing.</p>;
}

function Totals({ calc, biz }: { calc: CalcResult; biz: Business }) {
  const row = (label: string, value: string, strong = false) => (
    <div className={cn("flex justify-between gap-3", strong && "mt-1 border-t border-line pt-2 text-[17px] font-semibold")}>
      <dt className={strong ? undefined : "text-muted"}>{label}</dt>
      <dd className="tabular">{value}</dd>
    </div>
  );
  return (
    <dl className="mt-3 grid gap-1.5 text-[15px]" data-testid="summary">
      {calc.chargesGst ? (
        <>
          {row("Taxable value", formatPaise(calc.taxable))}
          {calc.intraState === false ? (
            row("IGST", formatPaise(calc.igst))
          ) : (
            <>
              {row("CGST", formatPaise(calc.cgst))}
              {row(calc.stateTaxLabel, formatPaise(calc.sgst))}
            </>
          )}
        </>
      ) : (
        row("Items and delivery", formatPaise(calc.exact))
      )}
      {calc.roundOff !== 0 && row("Round off", `${calc.roundOff > 0 ? "+" : ""}${formatPaise(calc.roundOff)}`)}
      {row("Total", formatPaise(calc.grandTotal), true)}
      {!calc.chargesGst && (
        <p className="mt-1 text-[13px] text-muted">
          {biz.gst_status === "composition" ? "Bill of Supply: no GST is charged." : "No GST: you're not registered."}
        </p>
      )}
    </dl>
  );
}

// ---------------------------------------------------------------------------------------------
// One item
// ---------------------------------------------------------------------------------------------

function ItemEditor({
  line,
  index,
  count,
  biz,
  products,
  result,
  errFor,
  onPatch,
  onConfirm,
  onChooseProduct,
  onRemove,
}: {
  line: DraftLine;
  index: number;
  count: number;
  biz: Business;
  products: Product[];
  result: CalcResult["lines"][number] | undefined;
  errFor: (field: string) => string | null;
  onPatch: (p: Partial<DraftLine>, clears?: string[]) => void;
  onConfirm: (field: string) => void;
  onChooseProduct: (id: string) => void;
  onRemove: () => void;
}) {
  const [showDiscount, setShowDiscount] = useState(line.discount > 0);
  const regular = biz.gst_status === "regular";
  const registered = biz.gst_status !== "unregistered";
  const flag = (f: string) => line.checks.find((c) => c.field === f);
  const n = index + 1;
  const linked = line.productId && products.some((p) => p.id === line.productId);
  const noRate = regular && rateMissing(line);
  const sameName = !linked && line.name.trim() ? productNamed(line.name, products) : undefined;

  return (
    <div className={cn("rounded-control border border-line p-3 sm:p-4", line.checks.length > 0 && "border-[#e8cf7a] bg-[#fffdf5]")}>
      <div className="flex items-start justify-between gap-2">
        <p className="pt-2 text-[13px] font-semibold text-muted">Item {n}</p>
        <button type="button" className="btn-ghost btn-sm -mr-2 text-muted" onClick={onRemove} aria-label={`Remove item ${n}`} disabled={count === 1 && !line.name}>
          <Trash2 className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <div className="mt-1 grid grid-cols-2 gap-3 sm:grid-cols-6">
        <Field label="Product" className="col-span-2 sm:col-span-6">
          {(p) => (
            <>
              <select
                {...p}
                className={cn("input", flag("product") && "needs-check")}
                value={linked ? line.productId! : ""}
                onChange={(e) => onChooseProduct(e.target.value)}
              >
                <option value="">{products.length ? "Not in my products (type below)" : "No products yet (type below)"}</option>
                {products.map((pr) => (
                  <option key={pr.id} value={pr.id}>
                    {pr.name} · {formatPaise(Math.round(pr.price * 100))}
                  </option>
                ))}
              </select>
              {flag("product") && <CheckNote flag={flag("product")!} onConfirm={() => onConfirm("product")} />}
            </>
          )}
        </Field>
        <Field label="Description" className="col-span-2 sm:col-span-3" error={errFor("name")}>
          {(p) => <input {...p} className="input" value={line.name} onChange={(e) => onPatch({ name: e.target.value })} />}
        </Field>
        <Field label="Size, colour" optional className="col-span-2 sm:col-span-3">
          {(p) => <input {...p} className="input" value={line.variant} placeholder="Blue, M" onChange={(e) => onPatch({ variant: e.target.value })} />}
        </Field>
        <Field label="Quantity" className="col-span-2 sm:col-span-2" error={errFor("qty")}>
          {(p) => (
            <>
              <div className="flex gap-2">
                <NumberInput
                  {...p}
                  className={cn("min-w-0 flex-1", flag("qty") && "needs-check")}
                  value={line.qty}
                  onValue={(q) => onPatch({ qty: q }, ["qty"])}
                />
                <select
                  className="input w-[84px] shrink-0 px-2 pr-7 text-[14px]"
                  aria-label={`Unit for item ${n}`}
                  value={line.unit}
                  onChange={(e) => onPatch({ unit: e.target.value as Unit })}
                >
                  {UNITS.map((u) => (
                    <option key={u.code} value={u.code}>
                      {u.code}
                    </option>
                  ))}
                </select>
              </div>
              {flag("qty") && <CheckNote flag={flag("qty")!} onConfirm={() => onConfirm("qty")} />}
            </>
          )}
        </Field>
        <Field label={regular && biz.prices_include_gst ? "Price incl. GST" : "Price"} className={cn(!registered && "col-span-2", "sm:col-span-2")}>
          {(p) => (
            <>
              <NumberInput
                {...p}
                rupee
                className={cn(flag("price") && "needs-check")}
                value={line.price}
                onValue={(v) => onPatch({ price: v }, ["price"])}
              />
              {flag("price") && <CheckNote flag={flag("price")!} onConfirm={() => onConfirm("price")} />}
            </>
          )}
        </Field>
        {registered && (
          <Field label="HSN code" className="sm:col-span-2" error={errFor("hsn")}>
            {(p) => (
              <input
                {...p}
                className="input font-mono"
                inputMode="numeric"
                maxLength={8}
                value={line.hsn}
                onChange={(e) => onPatch({ hsn: e.target.value.replace(/\D/g, "") })}
              />
            )}
          </Field>
        )}
        {regular && (
          <Field
            label="GST rate"
            className="col-span-2 sm:col-span-3"
            error={errFor("gstRate")}
            hint={line.rateRule === "apparel_2500" && result && !noRate ? `${formatRate(result.rate)} applies at this price.` : undefined}
          >
            {(p) => (
              <select
                {...p}
                className={cn("input", noRate && "needs-check")}
                value={noRate ? "" : line.rateRule === "apparel_2500" ? "apparel" : String(line.gstRate)}
                onChange={(e) =>
                  e.target.value === "apparel"
                    ? onPatch({ rateRule: "apparel_2500", rateSet: true })
                    : onPatch({ rateRule: "fixed", gstRate: Number(e.target.value), rateSet: true })
                }
              >
                {noRate && (
                  <option value="" disabled>
                    Choose GST rate
                  </option>
                )}
                <option value="apparel">Clothing/footwear: 5% or 18%</option>
                {GST_RATES.map((r) => (
                  <option key={r} value={String(r)}>
                    {formatRate(r)}
                  </option>
                ))}
              </select>
            )}
          </Field>
        )}
        {showDiscount ? (
          <Field label="Discount" className="col-span-2 sm:col-span-3" error={errFor("discount")}>
            {(p) => <NumberInput {...p} rupee value={line.discount} onValue={(v) => onPatch({ discount: v })} />}
          </Field>
        ) : (
          <div className={cn("col-span-2 flex items-end", regular ? "sm:col-span-3" : "sm:col-span-6")}>
            <button type="button" className="text-[14px] font-medium text-brand underline-offset-2 hover:underline" onClick={() => setShowDiscount(true)}>
              Add discount
            </button>
          </div>
        )}
      </div>

      {!linked && line.name.trim() !== "" && (
        <div className="mt-3 text-[14px]">
          {sameName ? (
            <p className="text-muted">
              "{sameName.name}" is already in your products.{" "}
              <button type="button" className="font-medium text-brand underline underline-offset-2" onClick={() => onChooseProduct(sameName.id)}>
                Use it
              </button>
            </p>
          ) : (
            <div className="flex items-start gap-2">
              <input
                id={`save-${line.key}`}
                type="checkbox"
                className="mt-[3px] h-4 w-4 shrink-0 cursor-pointer accent-[var(--color-brand)]"
                checked={line.saveAsProduct === true}
                aria-describedby={`save-hint-${line.key}`}
                onChange={(e) => onPatch({ saveAsProduct: e.target.checked })}
              />
              <div>
                <label htmlFor={`save-${line.key}`} className="cursor-pointer">
                  Save to my products
                </label>
                <p id={`save-hint-${line.key}`} className="text-[13px] text-muted">
                  Next time Parchi fills in its price, HSN and GST rate.
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      <p className="mt-3 flex items-center justify-between border-t border-line pt-2.5 text-[14px]">
        <span className="text-muted">
          {regular && result && !noRate ? `Amount (${formatRate(result.rate)} GST)` : "Amount"}
        </span>
        <span className="tabular font-semibold" data-testid={`line-total-${index}`}>
          {formatPaise(result?.total ?? 0)}
        </span>
      </p>
    </div>
  );
}
