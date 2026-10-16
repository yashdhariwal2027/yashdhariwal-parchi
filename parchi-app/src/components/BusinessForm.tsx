import { useState, type FormEvent, type ReactNode } from "react";
import { ImagePlus, Trash2 } from "lucide-react";
import { Field, Notice, Spinner } from "./ui";
import { STATES, stateByCode, stateHintFromAddress } from "@/lib/gst/states";
import { gstinMessage, gstinProblem, normalizeGstin } from "@/lib/gst/gstin";
import { fyLabel, todayIST } from "@/lib/gst/dates";
import { imageToDataUrl } from "@/lib/image";
import type { BusinessInput } from "@/lib/db";
import type { Business } from "@/lib/types";
import type { GstStatus } from "@/lib/gst/calc";
import { cn } from "@/lib/utils";

const UPI_RE = /^[A-Za-z0-9._-]{2,255}@[A-Za-z][A-Za-z0-9.-]{1,63}$/;

export const EMPTY_BUSINESS: BusinessInput = {
  name: "",
  legal_name: null,
  address: "",
  state_code: "",
  pincode: null,
  phone: null,
  email: null,
  gst_status: "unregistered",
  gstin: null,
  prices_include_gst: true,
  invoice_prefix: "INV",
  upi_id: null,
  logo: null,
  signature: null,
  terms: null,
};

const GST_OPTIONS: { value: GstStatus; title: string; body: string }[] = [
  { value: "unregistered", title: "Not registered for GST", body: "You'll send simple invoices without GST." },
  { value: "composition", title: "Composition scheme", body: "You'll send a Bill of Supply. No GST is added." },
  { value: "regular", title: "Regular GST registration", body: "You'll send Tax Invoices with CGST, SGST or IGST." },
];

type Errors = Partial<Record<keyof BusinessInput, string>>;

export function validateBusiness(b: BusinessInput): Errors {
  const e: Errors = {};
  if (!b.name.trim()) e.name = "Enter your business name.";
  if (!b.state_code) e.state_code = "Choose your state.";
  if (b.pincode && !/^[1-9]\d{5}$/.test(b.pincode)) e.pincode = "A PIN code has 6 digits.";
  if (b.gst_status !== "unregistered") {
    const p = gstinProblem(b.gstin ?? "");
    if (p) e.gstin = gstinMessage(p);
    else if (b.state_code && b.gstin!.slice(0, 2) !== b.state_code) e.gstin = "This GSTIN is from a different state than the one chosen.";
    if (!b.address.trim()) e.address = "Your address is required on GST invoices.";
  }
  if (!/^[A-Z0-9]{1,4}$/.test(b.invoice_prefix)) e.invoice_prefix = "Use 1 to 4 letters or numbers.";
  if (b.upi_id && !UPI_RE.test(b.upi_id)) e.upi_id = "This doesn't look like a UPI ID (for example noorstudio@okhdfcbank).";
  if (b.email && !/^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(b.email)) e.email = "Enter a valid email address.";
  return e;
}

export function BusinessForm({
  initial,
  onSave,
  submitLabel,
  full,
  intro,
}: {
  initial: Business | BusinessInput;
  onSave: (b: BusinessInput) => Promise<void>;
  submitLabel: string;
  /** Settings shows everything; onboarding hides the extras */
  full?: boolean;
  intro?: ReactNode;
}) {
  const [b, setB] = useState<BusinessInput>(() => {
    const { ...rest } = initial as Business;
    delete (rest as Partial<Business>).user_id;
    return { ...EMPTY_BUSINESS, ...rest };
  });
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imgError, setImgError] = useState<string | null>(null);
  const errors = submitted ? validateBusiness(b) : {};
  const hint = b.state_code ? stateHintFromAddress(b.address, b.pincode) : undefined;
  const addressHint = hint && hint.state.code !== b.state_code ? hint : undefined;
  const set = <K extends keyof BusinessInput>(k: K, v: BusinessInput[K]) => setB((x) => ({ ...x, [k]: v }));
  const registered = b.gst_status !== "unregistered";

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    setError(null);
    const errs = validateBusiness(b);
    if (Object.keys(errs).length) {
      const first = Object.keys(errs)[0];
      document.querySelector<HTMLElement>(`[data-field="${first}"] input, [data-field="${first}"] select, [data-field="${first}"] textarea`)?.focus();
      return;
    }
    setSaving(true);
    try {
      const clean: BusinessInput = {
        ...b,
        name: b.name.trim(),
        legal_name: registered ? b.legal_name?.trim() || null : null,
        address: b.address.trim(),
        gstin: registered ? normalizeGstin(b.gstin ?? "") : null,
        prices_include_gst: b.gst_status === "regular" ? b.prices_include_gst : true,
        pincode: b.pincode?.trim() || null,
        phone: b.phone?.trim() || null,
        email: b.email?.trim() || null,
        upi_id: b.upi_id?.trim() || null,
        terms: b.terms?.trim() || null,
      };
      await onSave(clean);
    } catch (err) {
      setError((err as Error)?.message || "Couldn't save. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function onImage(kind: "logo" | "signature", file: File | undefined) {
    setImgError(null);
    if (!file) return;
    try {
      set(kind, await imageToDataUrl(file, kind === "logo" ? 400 : 480));
    } catch (e) {
      setImgError((e as Error).message);
    }
  }

  return (
    <form noValidate onSubmit={onSubmit} className="grid gap-6">
      {intro}
      <section className="card grid gap-4 p-4 sm:p-6" aria-labelledby="biz-basics">
        <h2 id="biz-basics" className="h3">
          Your business
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div data-field="name" className="sm:col-span-2">
            <Field label="Business name" hint="As your customers know it. Printed at the top of your invoices." error={errors.name}>
              {(p) => <input {...p} className="input" autoComplete="organization" value={b.name} onChange={(e) => set("name", e.target.value)} />}
            </Field>
          </div>
          <div data-field="state_code">
            <Field label="State" error={errors.state_code}>
              {(p) => (
                <select {...p} className="input" value={b.state_code} onChange={(e) => set("state_code", e.target.value)}>
                  <option value="">Choose your state</option>
                  {STATES.map((s) => (
                    <option key={s.code} value={s.code}>
                      {s.name}
                    </option>
                  ))}
                </select>
              )}
            </Field>
          </div>
          <div data-field="pincode">
            <Field label="PIN code" optional error={errors.pincode}>
              {(p) => (
                <input
                  {...p}
                  className="input"
                  inputMode="numeric"
                  maxLength={6}
                  autoComplete="postal-code"
                  value={b.pincode ?? ""}
                  onChange={(e) => set("pincode", e.target.value.replace(/\D/g, ""))}
                />
              )}
            </Field>
          </div>
          <div data-field="address" className="sm:col-span-2">
            <Field label="Address" optional={!registered} error={errors.address}>
              {(p) => (
                <textarea {...p} rows={2} className="input" autoComplete="street-address" value={b.address} onChange={(e) => set("address", e.target.value)} />
              )}
            </Field>
          </div>
          {addressHint && (
            <div className="sm:col-span-2" data-testid="address-state-warning">
              <Notice tone="warn">
                {addressHint.from === "pin" ? "Your PIN code " : "Your address mentions "}
                {addressHint.word.replace(/\b\w/g, (c) => c.toUpperCase())}, which is in {addressHint.state.name}, but your state is set to{" "}
                {stateByCode(b.state_code)?.name}. Your state, GSTIN and address should all match your GST registration, because the state
                decides whether customers pay CGST + SGST or IGST.
              </Notice>
            </div>
          )}
          {full && (
            <>
              <div data-field="phone">
                <Field label="Phone" optional>
                  {(p) => <input {...p} className="input" type="tel" autoComplete="tel" value={b.phone ?? ""} onChange={(e) => set("phone", e.target.value)} />}
                </Field>
              </div>
              <div data-field="email">
                <Field label="Email on invoices" optional error={errors.email}>
                  {(p) => <input {...p} className="input" type="email" value={b.email ?? ""} onChange={(e) => set("email", e.target.value)} />}
                </Field>
              </div>
            </>
          )}
        </div>
      </section>

      <section className="card grid gap-4 p-4 sm:p-6" aria-labelledby="biz-gst">
        <div>
          <h2 id="biz-gst" className="h3">
            GST
          </h2>
          <p className="mt-1 text-[14px] text-muted">This decides what kind of document Parchi makes. Ask your CA if you're not sure.</p>
        </div>
        <fieldset>
          <legend className="sr-only">GST registration</legend>
          <div className="grid gap-2 md:grid-cols-3">
            {GST_OPTIONS.map((o) => (
              <label
                key={o.value}
                className={cn(
                  "flex cursor-pointer gap-3 rounded-control border p-3.5 transition-colors",
                  b.gst_status === o.value ? "border-brand bg-brand-tint" : "border-line bg-surface hover:bg-[#fcfbf8]",
                )}
              >
                <input
                  type="radio"
                  name="gst_status"
                  className="mt-1 h-4 w-4 accent-[#0e6b4f]"
                  checked={b.gst_status === o.value}
                  onChange={() => set("gst_status", o.value)}
                />
                <span>
                  <span className="block text-[15px] font-medium">{o.title}</span>
                  <span className="block text-[13px] leading-snug text-muted">{o.body}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        {registered && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div data-field="gstin">
              <Field label="GSTIN" error={errors.gstin} hint="15 characters, from your GST registration certificate.">
                {(p) => (
                  <input
                    {...p}
                    className="input font-mono uppercase tracking-[0.04em]"
                    maxLength={15}
                    autoCapitalize="characters"
                    spellCheck={false}
                    value={b.gstin ?? ""}
                    onChange={(e) => {
                      const g = normalizeGstin(e.target.value);
                      setB((x) => ({
                        ...x,
                        gstin: g,
                        state_code: g.length >= 2 && STATES.some((s) => s.code === g.slice(0, 2)) ? g.slice(0, 2) : x.state_code,
                      }));
                    }}
                  />
                )}
              </Field>
            </div>
            <div data-field="legal_name">
              <Field label="Legal name" optional hint="If different from your business name, as on the GST certificate.">
                {(p) => <input {...p} className="input" value={b.legal_name ?? ""} onChange={(e) => set("legal_name", e.target.value)} />}
              </Field>
            </div>
          </div>
        )}

        {b.gst_status === "regular" && (
          <fieldset>
            <legend className="label">Your product prices</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {[
                { v: true, t: "Include GST", d: "₹1,299 means the customer pays ₹1,299. Usual for online sellers." },
                { v: false, t: "Don't include GST", d: "₹1,299 plus GST on top." },
              ].map((o) => (
                <label
                  key={String(o.v)}
                  className={cn(
                    "flex cursor-pointer gap-3 rounded-control border p-3.5",
                    b.prices_include_gst === o.v ? "border-brand bg-brand-tint" : "border-line bg-surface",
                  )}
                >
                  <input
                    type="radio"
                    name="prices_include_gst"
                    className="mt-1 h-4 w-4 accent-[#0e6b4f]"
                    checked={b.prices_include_gst === o.v}
                    onChange={() => set("prices_include_gst", o.v)}
                  />
                  <span>
                    <span className="block text-[15px] font-medium">{o.t}</span>
                    <span className="block text-[13px] leading-snug text-muted">{o.d}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        )}
      </section>

      <section className="card grid gap-4 p-4 sm:p-6" aria-labelledby="biz-inv">
        <h2 id="biz-inv" className="h3">
          Invoices
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div data-field="invoice_prefix">
            <Field
              label="Invoice number prefix"
              error={errors.invoice_prefix}
              hint={
                <>
                  Your numbers will look like{" "}
                  <span className="font-mono text-ink">
                    {b.invoice_prefix || "INV"}/{fyLabel(todayIST())}/0001
                  </span>
                  . They restart every April, as GST requires.
                </>
              }
            >
              {(p) => (
                <input
                  {...p}
                  className="input font-mono uppercase"
                  maxLength={4}
                  value={b.invoice_prefix}
                  onChange={(e) => set("invoice_prefix", e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
                />
              )}
            </Field>
          </div>
          <div data-field="upi_id">
            <Field label="UPI ID" optional error={errors.upi_id} hint="Adds a scan-to-pay QR code to unpaid invoices.">
              {(p) => (
                <input
                  {...p}
                  className="input"
                  autoCapitalize="none"
                  spellCheck={false}
                  placeholder="name@bank"
                  value={b.upi_id ?? ""}
                  onChange={(e) => set("upi_id", e.target.value.trim())}
                />
              )}
            </Field>
          </div>
          {full && (
            <>
              <div className="sm:col-span-2">
                <Field label="Note at the bottom of every invoice" optional hint="For example return policy or thank-you note.">
                  {(p) => <textarea {...p} rows={2} maxLength={1000} className="input" value={b.terms ?? ""} onChange={(e) => set("terms", e.target.value)} />}
                </Field>
              </div>
              <ImagePicker label="Logo" value={b.logo} onPick={(f) => onImage("logo", f)} onClear={() => set("logo", null)} />
              <ImagePicker
                label="Signature"
                hint={registered ? "GST rules ask for the seller's signature on invoices." : undefined}
                value={b.signature}
                onPick={(f) => onImage("signature", f)}
                onClear={() => set("signature", null)}
              />
              {imgError && (
                <Notice tone="danger" role="alert" className="sm:col-span-2">
                  {imgError}
                </Notice>
              )}
            </>
          )}
        </div>
      </section>

      {submitted && Object.keys(errors).length > 0 && (
        <Notice tone="danger" role="alert">
          Fix the highlighted fields to continue.
        </Notice>
      )}
      {error && (
        <Notice tone="danger" role="alert">
          {error}
        </Notice>
      )}
      <div>
        <button type="submit" className="btn-primary w-full sm:w-auto" disabled={saving}>
          {saving ? <Spinner label="Saving..." /> : submitLabel}
        </button>
      </div>
    </form>
  );
}

function ImagePicker({
  label,
  hint,
  value,
  onPick,
  onClear,
}: {
  label: string;
  hint?: string;
  value: string | null;
  onPick: (f: File | undefined) => void;
  onClear: () => void;
}) {
  return (
    <div>
      <p className="label">
        {label} <span className="font-normal text-muted">(optional)</span>
      </p>
      <div className="flex items-center gap-3">
        <div className="flex h-16 w-24 shrink-0 items-center justify-center overflow-hidden rounded-control border border-line bg-page">
          {value ? <img src={value} alt={`Your ${label.toLowerCase()}`} className="max-h-full max-w-full object-contain" /> : <ImagePlus className="h-5 w-5 text-muted" aria-hidden="true" />}
        </div>
        <label className="btn-secondary btn-sm cursor-pointer">
          {value ? "Change" : "Upload"}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="sr-only"
            aria-label={`Upload ${label.toLowerCase()}`}
            onChange={(e) => {
              onPick(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </label>
        {value && (
          <button type="button" className="btn-ghost btn-sm" onClick={onClear} aria-label={`Remove ${label.toLowerCase()}`}>
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>
      {hint && <p className="hint">{hint}</p>}
    </div>
  );
}
