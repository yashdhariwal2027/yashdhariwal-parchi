import { useEffect, useState } from "react";
import QRCode from "qrcode";
import type { DocModel } from "@/lib/invoice/doc";
import { cn } from "@/lib/utils";

/** The invoice as a sheet of paper, on screen. The PDF (lib/pdf) prints the same DocModel. */
export function InvoiceDocument({ doc, className }: { doc: DocModel; className?: string }) {
  const [qr, setQr] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    if (doc.upi) QRCode.toDataURL(doc.upi.uri, { margin: 1, width: 240 }).then((u) => live && setQr(u)).catch(() => setQr(null));
    else setQr(null);
    return () => {
      live = false;
    };
  }, [doc.upi]);

  const th = "px-2 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.04em] text-muted";
  const td = "px-2 py-2 align-top";
  const num = "text-right tabular";

  return (
    <article
      aria-label={`${doc.title} ${doc.number}`}
      className={cn("relative overflow-hidden rounded-card border border-line bg-white p-4 text-[13px] leading-[1.45] text-ink shadow-card sm:p-7", className)}
    >
      {(doc.cancelled || doc.isDraft) && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 flex items-center justify-center text-[64px] font-bold uppercase tracking-[0.1em] text-[rgba(180,35,24,0.09)] sm:text-[96px]"
          style={{ transform: "rotate(-18deg)" }}
        >
          {doc.cancelled ? "Cancelled" : "Draft"}
        </div>
      )}

      <header className="flex flex-col gap-4 border-b border-line pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 gap-3">
          {doc.seller.logo && <img src={doc.seller.logo} alt="" className="h-14 w-14 shrink-0 rounded object-contain" />}
          <div className="min-w-0">
            <p className="text-[17px] font-semibold leading-tight">{doc.seller.name}</p>
            {doc.seller.legalName && <p className="text-muted">{doc.seller.legalName}</p>}
            {doc.seller.addressLines.map((l) => (
              <p key={l} className="text-muted">
                {l}
              </p>
            ))}
            {doc.seller.gstin && (
              <p className="mt-0.5">
                GSTIN <span className="font-mono">{doc.seller.gstin}</span>
              </p>
            )}
            {doc.seller.contact && <p className="text-muted">{doc.seller.contact}</p>}
          </div>
        </div>
        <div className="shrink-0 sm:text-right">
          <p className="text-[18px] font-semibold uppercase tracking-[0.02em]">{doc.title}</p>
          {doc.copyLabel && <p className="text-[11px] uppercase tracking-[0.06em] text-muted">{doc.copyLabel}</p>}
          <dl className="mt-2 grid grid-cols-[auto_auto] justify-start gap-x-3 gap-y-0.5 sm:justify-end">
            <dt className="text-muted">Invoice no.</dt>
            <dd className="font-mono font-medium">{doc.number}</dd>
            <dt className="text-muted">Date</dt>
            <dd>{doc.date}</dd>
            {doc.placeOfSupply && (
              <>
                <dt className="text-muted">Place of supply</dt>
                <dd>{doc.placeOfSupply}</dd>
              </>
            )}
            {doc.reverseCharge && (
              <>
                <dt className="text-muted">Reverse charge</dt>
                <dd>{doc.reverseCharge}</dd>
              </>
            )}
          </dl>
        </div>
      </header>

      {doc.declaration && <p className="mt-3 rounded bg-alt px-2.5 py-1.5 text-[12px] font-medium">{doc.declaration}</p>}

      <section className="mt-4" aria-label="Billed to">
        <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">Bill to / Ship to</p>
        <p className="mt-1 font-semibold">{doc.customer.name}</p>
        {doc.customer.addressLines.map((l) => (
          <p key={l}>{l}</p>
        ))}
        {doc.customer.state && <p>State: {doc.customer.state}</p>}
        {doc.customer.gstin && (
          <p>
            GSTIN <span className="font-mono">{doc.customer.gstin}</span>
          </p>
        )}
        {doc.customer.phone && <p className="text-muted">{doc.customer.phone}</p>}
      </section>

      {/* Phones: one block per item instead of a wide table */}
      <ul className="mt-4 divide-y divide-line border-y border-line sm:hidden" aria-label="Items">
        {doc.rows.map((r, i) => (
          <li key={i} className="py-2.5">
            <div className="flex justify-between gap-3">
              <p className="min-w-0">
                {r.description}
                {r.variant && <span className="text-muted">, {r.variant}</span>}
              </p>
              <p className="tabular shrink-0 font-medium">{r.amount}</p>
            </div>
            <p className="tabular mt-0.5 text-[12px] text-muted">
              {[
                r.qty ? `${r.qty} × ${r.price}` : r.price,
                r.discount ? `less ${r.discount}` : "",
                doc.showHsn && r.hsn ? `HSN ${r.hsn}` : "",
                doc.showTax ? `Taxable ${r.taxable} · GST ${r.rate}` : "",
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </li>
        ))}
      </ul>

      <div className="mt-4 hidden overflow-x-auto sm:block" tabIndex={0} role="region" aria-label="Items table">
        <table className="w-full min-w-[520px] border-collapse">
          <thead className="border-y border-line bg-page">
            <tr>
              <th className={th}>#</th>
              <th className={th}>Item</th>
              {doc.showHsn && <th className={th}>HSN</th>}
              <th className={cn(th, "text-right")}>Qty</th>
              <th className={cn(th, "text-right")}>{doc.showTax && doc.pricesIncludeGst ? "Price incl. GST" : "Price"}</th>
              {doc.showDiscount && <th className={cn(th, "text-right")}>Discount</th>}
              {doc.showTax && <th className={cn(th, "text-right")}>Taxable value</th>}
              {doc.showTax && <th className={cn(th, "text-right")}>GST</th>}
              <th className={cn(th, "text-right")}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {doc.rows.map((r, i) => (
              <tr key={i} className="border-b border-line">
                <td className={cn(td, "text-muted")}>{r.n}</td>
                <td className={td}>
                  {r.description}
                  {r.variant && <span className="text-muted">, {r.variant}</span>}
                </td>
                {doc.showHsn && <td className={cn(td, "font-mono text-[12px]")}>{r.hsn}</td>}
                <td className={cn(td, num)}>{r.qty}</td>
                <td className={cn(td, num)}>{r.price}</td>
                {doc.showDiscount && <td className={cn(td, num)}>{r.discount}</td>}
                {doc.showTax && <td className={cn(td, num)}>{r.taxable}</td>}
                {doc.showTax && <td className={cn(td, num)}>{r.rate}</td>}
                <td className={cn(td, num, "font-medium")}>{r.amount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:justify-between">
        <div className="min-w-0 sm:max-w-[55%]">
          {doc.summary.length > 0 && (
            <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Tax summary">
              <table className="w-full border-collapse text-[12px]">
                <caption className="mb-1 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">Tax summary</caption>
                <thead>
                  <tr className="border-y border-line bg-page">
                    <th className={th}>HSN</th>
                    <th className={cn(th, "text-right")}>Taxable</th>
                    <th className={cn(th, "text-right")}>Rate</th>
                    {doc.intraState ? (
                      <>
                        <th className={cn(th, "text-right")}>CGST</th>
                        <th className={cn(th, "text-right")}>{doc.stateTaxLabel}</th>
                      </>
                    ) : (
                      <th className={cn(th, "text-right")}>IGST</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {doc.summary.map((s) => (
                    <tr key={`${s.hsn}-${s.rate}`} className="border-b border-line">
                      <td className={cn(td, "font-mono")}>{s.hsn}</td>
                      <td className={cn(td, num)}>{s.taxable}</td>
                      <td className={cn(td, num)}>{s.rate}</td>
                      {doc.intraState ? (
                        <>
                          <td className={cn(td, num)}>{s.cgst}</td>
                          <td className={cn(td, num)}>{s.sgst}</td>
                        </>
                      ) : (
                        <td className={cn(td, num)}>{s.igst}</td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-3 text-[12px]">
            <span className="text-muted">Amount in words: </span>
            {doc.amountInWords}
          </p>
          {(doc.payment || doc.paid) && (
            <p className="mt-1 text-[12px]">
              <span className="text-muted">Payment: </span>
              {[doc.payment, doc.paid ? "Paid" : null].filter(Boolean).join(" · ")}
            </p>
          )}
          {doc.notes && (
            <p className="mt-1 text-[12px]">
              <span className="text-muted">Note: </span>
              {doc.notes}
            </p>
          )}
        </div>

        <dl className="tabular w-full self-start sm:w-[250px]">
          {doc.totals.map((t) => (
            <div key={t.label} className="flex justify-between gap-4 py-0.5">
              <dt className="text-muted">{t.label}</dt>
              <dd>{t.value}</dd>
            </div>
          ))}
          <div className="mt-1 flex justify-between gap-4 border-t border-line pt-2 text-[15px] font-semibold">
            <dt>Total</dt>
            <dd data-testid="doc-total">{doc.grandTotal}</dd>
          </div>
        </dl>
      </div>

      <footer className="mt-5 flex flex-col gap-4 border-t border-line pt-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex items-end gap-3">
          {doc.upi && qr && (
            <>
              <img src={qr} alt={`UPI QR code to pay ${doc.upi.amount}`} className="h-24 w-24" />
              <p className="pb-1 text-[12px] text-muted">
                Scan to pay
                <br />
                <span className="font-medium text-ink">{doc.upi.amount}</span> by UPI
              </p>
            </>
          )}
        </div>
        <div className="text-left sm:text-right">
          <p className="text-[12px]">For {doc.seller.legalName ?? doc.seller.name}</p>
          {doc.seller.signature ? (
            <img src={doc.seller.signature} alt="Signature" className="my-1 h-12 max-w-[160px] object-contain sm:ml-auto" />
          ) : (
            <div className="h-10" />
          )}
          <p className="text-[12px] text-muted">Authorised signatory</p>
        </div>
      </footer>
      {doc.terms && <p className="mt-3 border-t border-line pt-3 text-[12px] text-muted">{doc.terms}</p>}
      {doc.cancelled && (
        <p className="mt-3 text-[12px] font-medium text-danger">
          Cancelled{doc.cancelled.reason ? `: ${doc.cancelled.reason}` : ""}
        </p>
      )}
    </article>
  );
}
