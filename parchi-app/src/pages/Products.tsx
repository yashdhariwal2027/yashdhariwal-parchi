import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Package, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { useBusiness } from "@/lib/auth";
import { createProduct, deleteProduct, listProducts, updateProduct, type ProductInput } from "@/lib/db";
import { friendlyError } from "@/lib/errors";
import { GST_RATES, UNITS, type Unit } from "@/lib/gst/calc";
import { formatPaise, formatRate } from "@/lib/gst/money";
import type { Product } from "@/lib/types";
import { Dialog, Field, Notice, PageLoading, Spinner, useToast } from "@/components/ui";
import { NumberInput } from "@/components/inputs";

const EMPTY: ProductInput = { name: "", aliases: "", price: 0, unit: "PCS", hsn: "", gst_rate: 5, rate_rule: "fixed", archived: false };

export function Products() {
  const biz = useBusiness();
  const toast = useToast();
  const [items, setItems] = useState<Product[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Product | "new" | null>(null);
  const [deleting, setDeleting] = useState<Product | null>(null);
  const [busyDelete, setBusyDelete] = useState(false);
  const [q, setQ] = useState("");

  useEffect(() => {
    listProducts()
      .then(setItems)
      .catch((e) => setError(friendlyError(e, "Couldn't load your products.")));
  }, []);

  const shown = useMemo(() => {
    const n = q.trim().toLowerCase();
    return (items ?? []).filter((p) => !n || p.name.toLowerCase().includes(n) || p.aliases.toLowerCase().includes(n) || (p.hsn ?? "").includes(n));
  }, [items, q]);

  async function onDelete() {
    if (!deleting) return;
    setBusyDelete(true);
    try {
      await deleteProduct(deleting.id);
      setItems((xs) => (xs ?? []).filter((x) => x.id !== deleting.id));
      toast(`${deleting.name} deleted`);
      setDeleting(null);
    } catch (e) {
      toast(friendlyError(e), "danger");
    } finally {
      setBusyDelete(false);
    }
  }

  if (error) {
    return (
      <Notice tone="danger" role="alert" title="Couldn't load products">
        {error}
      </Notice>
    );
  }
  if (!items) return <PageLoading />;

  const regular = biz.gst_status === "regular";
  const registered = biz.gst_status !== "unregistered";
  const missingHsn = registered ? items.filter((p) => !p.hsn).length : 0;

  return (
    <div className="mx-auto max-w-[880px]">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="h1">Products</h1>
          <p className="mt-1 text-muted">Parchi uses this list to fill in prices{registered ? ", HSN codes and GST" : ""} when it reads an order.</p>
        </div>
        <button type="button" className="btn-primary btn-sm" onClick={() => setEditing("new")}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          Add product
        </button>
      </div>

      {missingHsn > 0 && (
        <Notice tone="warn" className="mt-4">
          {missingHsn === 1 ? "1 product has" : `${missingHsn} products have`} no HSN code. GST invoices need one for every item.
        </Notice>
      )}

      {items.length === 0 ? (
        <div className="card mt-6 px-5 py-10 text-center">
          <Package className="mx-auto h-8 w-8 text-muted" aria-hidden="true" />
          <p className="mt-3 text-[17px] font-semibold">Add what you sell</p>
          <p className="mx-auto mt-1 max-w-[380px] text-muted">
            Start with your best sellers. Add the names customers use too, like "blue wala kurta", so Parchi recognises them.
          </p>
          <button type="button" className="btn-primary mt-5" onClick={() => setEditing("new")}>
            Add your first product
          </button>
        </div>
      ) : (
        <>
          {items.length > 6 && (
            <div className="relative mt-5 sm:w-[320px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden="true" />
              <input type="search" className="input pl-9" placeholder="Search products" aria-label="Search products" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
          )}
          <ul className="card mt-4 divide-y divide-line overflow-hidden" aria-label="Products">
            {shown.map((p) => (
              <li key={p.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{p.name}</p>
                  <p className="mt-0.5 text-[13px] text-muted">
                    {[
                      `${formatPaise(Math.round(p.price * 100))} / ${p.unit}`,
                      registered ? (p.hsn ? `HSN ${p.hsn}` : "No HSN") : null,
                      regular ? (p.rate_rule === "apparel_2500" ? "GST 5% or 18%" : `GST ${formatRate(p.gst_rate)}`) : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  {p.aliases && <p className="mt-0.5 truncate text-[13px] text-muted">Also: {p.aliases}</p>}
                </div>
                <button type="button" className="btn-ghost btn-sm" onClick={() => setEditing(p)} aria-label={`Edit ${p.name}`}>
                  <Pencil className="h-4 w-4" aria-hidden="true" />
                </button>
                <button type="button" className="btn-ghost btn-sm text-muted" onClick={() => setDeleting(p)} aria-label={`Delete ${p.name}`}>
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              </li>
            ))}
            {shown.length === 0 && <li className="px-4 py-8 text-center text-muted">No products match.</li>}
          </ul>
        </>
      )}

      {editing && (
        <ProductDialog
          product={editing === "new" ? null : editing}
          regular={regular}
          registered={registered}
          includeGst={biz.prices_include_gst}
          onClose={() => setEditing(null)}
          onSaved={(p, isNew) => {
            setItems((xs) => {
              const list = isNew ? [...(xs ?? []), p] : (xs ?? []).map((x) => (x.id === p.id ? p : x));
              return list.sort((a, b) => a.name.localeCompare(b.name));
            });
            toast(isNew ? `${p.name} added` : `${p.name} saved`);
            setEditing(null);
          }}
        />
      )}

      <Dialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title={`Delete ${deleting?.name ?? "product"}?`}
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setDeleting(null)}>
              Keep it
            </button>
            <button type="button" className="btn-danger" onClick={onDelete} disabled={busyDelete}>
              {busyDelete ? <Spinner label="Deleting..." /> : "Delete"}
            </button>
          </>
        }
      >
        <p>Invoices you've already made keep their details. New orders won't be matched to this product.</p>
      </Dialog>
    </div>
  );
}

function ProductDialog({
  product,
  regular,
  registered,
  includeGst,
  onClose,
  onSaved,
}: {
  product: Product | null;
  regular: boolean;
  registered: boolean;
  includeGst: boolean;
  onClose: () => void;
  onSaved: (p: Product, isNew: boolean) => void;
}) {
  const [v, setV] = useState<ProductInput>(() => (product ? { ...EMPTY, ...product, hsn: product.hsn ?? "" } : EMPTY));
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof ProductInput>(k: K, val: ProductInput[K]) => setV((x) => ({ ...x, [k]: val }));

  const errors: Partial<Record<keyof ProductInput, string>> = {};
  if (submitted) {
    if (!v.name.trim()) errors.name = "Enter a name.";
    if (!(v.price >= 0) || v.price > 10000000) errors.price = "Enter a price.";
    if (v.hsn && !/^\d{4}(\d{2}){0,2}$/.test(v.hsn)) errors.hsn = "HSN codes have 4, 6 or 8 digits.";
    if (registered && !v.hsn) errors.hsn = "Needed on GST invoices.";
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    setError(null);
    const bad =
      !v.name.trim() || !(v.price >= 0) || v.price > 10000000 || (v.hsn && !/^\d{4}(\d{2}){0,2}$/.test(v.hsn)) || (registered && !v.hsn);
    if (bad) return;
    setSaving(true);
    const clean: ProductInput = {
      ...v,
      name: v.name.trim(),
      aliases: v.aliases
        .split(",")
        .map((a) => a.trim())
        .filter(Boolean)
        .join(", ")
        .slice(0, 300),
      hsn: v.hsn ? v.hsn : null,
      price: Math.round(v.price * 100) / 100,
    };
    try {
      const saved = product ? await updateProduct(product.id, clean) : await createProduct(clean);
      onSaved({ ...saved, price: Number(saved.price), gst_rate: Number(saved.gst_rate) }, !product);
    } catch (err) {
      setError(friendlyError(err, "Couldn't save the product. Please try again."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onClose={onClose} title={product ? "Edit product" : "Add product"}>
      <form noValidate onSubmit={onSubmit} className="grid gap-4">
        <Field label="Name" error={errors.name}>
          {(p) => <input {...p} className="input" value={v.name} onChange={(e) => set("name", e.target.value)} autoFocus />}
        </Field>
        <Field label="Other names customers use" optional hint='Separate with commas, e.g. "blue wala kurta, indigo kurta".'>
          {(p) => <input {...p} className="input" value={v.aliases} maxLength={300} onChange={(e) => set("aliases", e.target.value)} />}
        </Field>
        <div className="grid grid-cols-[minmax(0,1fr)_110px] gap-3">
          <Field label={regular ? (includeGst ? "Price incl. GST" : "Price excl. GST") : "Price"} error={errors.price}>
            {(p) => <NumberInput {...p} rupee value={v.price} onValue={(n) => set("price", n)} />}
          </Field>
          <Field label="Unit">
            {(p) => (
              <select {...p} className="input" value={v.unit} onChange={(e) => set("unit", e.target.value as Unit)}>
                {UNITS.map((u) => (
                  <option key={u.code} value={u.code}>
                    {u.code} · {u.label}
                  </option>
                ))}
              </select>
            )}
          </Field>
        </div>
        {registered && (
          <Field
            label="HSN code"
            error={errors.hsn}
            hint={
              <>
                Find it on the{" "}
                <a href="https://services.gst.gov.in/services/searchhsnsac" target="_blank" rel="noreferrer" className="text-brand underline underline-offset-2">
                  GST portal's HSN search
                </a>{" "}
                or ask your CA. Clothing is usually 61xx or 62xx.
              </>
            }
          >
            {(p) => (
              <input
                {...p}
                className="input font-mono"
                inputMode="numeric"
                maxLength={8}
                value={v.hsn ?? ""}
                onChange={(e) => set("hsn", e.target.value.replace(/\D/g, ""))}
              />
            )}
          </Field>
        )}
        {regular && (
          <Field
            label="GST rate"
            hint={v.rate_rule === "apparel_2500" ? "5% when the price is up to ₹2,500 a piece, 18% above. Parchi picks it per item." : "Check the rate for your HSN code with your CA."}
          >
            {(p) => (
              <select
                {...p}
                className="input"
                value={v.rate_rule === "apparel_2500" ? "apparel" : String(v.gst_rate)}
                onChange={(e) =>
                  e.target.value === "apparel"
                    ? setV((x) => ({ ...x, rate_rule: "apparel_2500", gst_rate: 5 }))
                    : setV((x) => ({ ...x, rate_rule: "fixed", gst_rate: Number(e.target.value) }))
                }
              >
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
        {error && (
          <Notice tone="danger" role="alert">
            {error}
          </Notice>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? <Spinner label="Saving..." /> : product ? "Save" : "Add product"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
