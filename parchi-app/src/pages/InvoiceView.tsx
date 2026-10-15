import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router";
import { ArrowLeft, CircleCheck, Download, SendHorizontal } from "lucide-react";
import { useBusiness } from "@/lib/auth";
import { cancelInvoice, getInvoice, setPaid } from "@/lib/db";
import { friendlyError } from "@/lib/errors";
import { buildDoc } from "@/lib/invoice/doc";
import { downloadBlob, makePdf, pdfFileName, sendInvoice } from "@/lib/pdf/share";
import type { InvoiceRow } from "@/lib/types";
import { Dialog, Field, Notice, PageLoading, Spinner, StatusBadge, useToast } from "@/components/ui";
import { InvoiceDocument } from "@/components/InvoiceDocument";

export function InvoiceView() {
  const { id } = useParams();
  const biz = useBusiness();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const justIssued = Boolean((location.state as { justIssued?: boolean } | null)?.justIssued);

  const [row, setRow] = useState<InvoiceRow | null | undefined>(undefined);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pdf, setPdf] = useState<Blob | null>(null);
  const [pdfError, setPdfError] = useState(false);
  const [busy, setBusy] = useState<null | "send" | "download" | "paid" | "cancel">(null);
  const [error, setError] = useState<string | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setRow(undefined);
    getInvoice(id!)
      .then((r) => {
        if (!live) return;
        if (r?.status === "draft") navigate(`/drafts/${r.id}`, { replace: true });
        else setRow(r);
      })
      .catch((e) => live && setLoadError(friendlyError(e)));
    return () => {
      live = false;
    };
  }, [id, navigate]);

  const doc = useMemo(() => (row ? buildDoc(row, biz) : null), [row, biz]);

  // Make the PDF as soon as the invoice opens, so "Send" can open the share sheet instantly
  // (phones only allow sharing straight after a tap).
  useEffect(() => {
    if (!doc) return;
    let live = true;
    setPdf(null);
    setPdfError(false);
    makePdf(doc)
      .then((b) => live && setPdf(b))
      .catch((e) => {
        console.error(e);
        if (live) setPdfError(true);
      });
    return () => {
      live = false;
    };
  }, [doc]);

  if (loadError) {
    return (
      <Notice tone="danger" role="alert" title="Couldn't open this invoice">
        {loadError}
      </Notice>
    );
  }
  if (row === null) return <NotFoundInvoice />;
  if (row === undefined || !doc) return <PageLoading />;

  async function ensurePdf(): Promise<Blob> {
    if (pdf) return pdf;
    const b = await makePdf(doc!);
    setPdf(b);
    return b;
  }

  async function onSend() {
    setError(null);
    setBusy("send");
    try {
      const b = await ensurePdf();
      const r = await sendInvoice(doc!, b);
      if (r === "fallback") toast("PDF downloaded. Attach it in the WhatsApp chat that just opened.");
    } catch {
      setError("Couldn't make the PDF. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  async function onDownload() {
    setError(null);
    setBusy("download");
    try {
      downloadBlob(await ensurePdf(), pdfFileName(doc!));
    } catch {
      setError("Couldn't make the PDF. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  async function onTogglePaid() {
    setError(null);
    setBusy("paid");
    try {
      const updated = await setPaid(row!.id, row!.payment_status !== "paid");
      setRow(updated);
      toast(updated.payment_status === "paid" ? "Marked as paid" : "Marked as unpaid");
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(null);
    }
  }

  async function onCancel() {
    if (!reason.trim()) {
      setReasonError("Add a short reason, for example: Customer cancelled the order.");
      return;
    }
    setBusy("cancel");
    try {
      const updated = await cancelInvoice(row!.id, reason.trim());
      setRow(updated);
      setCancelOpen(false);
      toast(`${updated.invoice_no} cancelled`);
    } catch (e) {
      setReasonError(friendlyError(e));
    } finally {
      setBusy(null);
    }
  }

  const cancelled = row.status === "cancelled";

  return (
    <div className="mx-auto max-w-[880px]">
      <Link to="/invoices" className="inline-flex items-center gap-1.5 text-[14px] font-medium text-muted hover:text-ink">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Invoices
      </Link>

      {justIssued && (
        <Notice tone="success" role="status" className="mt-4" title={`${row.invoice_no} is ready`}>
          Send it to {row.customer_name.split(" ")[0]} now, or download the PDF.
        </Notice>
      )}

      <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="h1 font-mono">{row.invoice_no}</h1>
            <StatusBadge status={row.status} paid={row.payment_status === "paid"} />
          </div>
          <p className="mt-1 text-muted">
            {row.customer_name} · {doc.date} · <span className="font-medium text-ink">{doc.grandTotal}</span>
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <button type="button" className="btn-primary" onClick={onSend} disabled={busy !== null || (!pdf && !pdfError)}>
            {busy === "send" ? (
              <Spinner label="Opening..." />
            ) : !pdf && !pdfError ? (
              <Spinner label="Preparing PDF..." />
            ) : (
              <>
                <SendHorizontal className="h-4 w-4" aria-hidden="true" />
                Send on WhatsApp
              </>
            )}
          </button>
          <button type="button" className="btn-secondary" onClick={onDownload} disabled={busy !== null}>
            {busy === "download" ? (
              <Spinner label="Preparing..." />
            ) : (
              <>
                <Download className="h-4 w-4" aria-hidden="true" />
                Download PDF
              </>
            )}
          </button>
        </div>
      </div>

      {error && (
        <Notice tone="danger" role="alert" className="mt-4">
          {error}
        </Notice>
      )}
      {pdfError && !error && (
        <Notice tone="warn" className="mt-4">
          The PDF couldn't be prepared in the background. Tap Download PDF to try again.
        </Notice>
      )}

      <div className="mt-5">
        <InvoiceDocument doc={doc} />
      </div>

      {!cancelled && (
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <button type="button" className="btn-secondary" onClick={onTogglePaid} disabled={busy !== null}>
            {busy === "paid" ? (
              <Spinner label="Saving..." />
            ) : row.payment_status === "paid" ? (
              "Mark as unpaid"
            ) : (
              <>
                <CircleCheck className="h-4 w-4" aria-hidden="true" />
                Mark as paid
              </>
            )}
          </button>
          <button type="button" className="btn-danger" onClick={() => setCancelOpen(true)} disabled={busy !== null}>
            Cancel invoice
          </button>
        </div>
      )}

      <Dialog
        open={cancelOpen}
        onClose={() => busy !== "cancel" && setCancelOpen(false)}
        title={`Cancel ${row.invoice_no}?`}
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setCancelOpen(false)} disabled={busy === "cancel"}>
              Keep invoice
            </button>
            <button type="button" className="btn-danger" onClick={onCancel} disabled={busy === "cancel"}>
              {busy === "cancel" ? <Spinner label="Cancelling..." /> : "Cancel invoice"}
            </button>
          </>
        }
      >
        <p>The invoice stays in your records marked as cancelled, and its number isn't used again.</p>
        <p className="mt-2 text-[14px] text-muted">
          If you've already reported this invoice in your GST return (GSTR-1), don't cancel it. Ask your CA about issuing a credit note instead.
        </p>
        <Field label="Reason" error={reasonError} className="mt-4">
          {(p) => (
            <input
              {...p}
              className="input"
              maxLength={300}
              value={reason}
              placeholder="Customer cancelled the order"
              onChange={(e) => {
                setReason(e.target.value);
                setReasonError(null);
              }}
            />
          )}
        </Field>
      </Dialog>
    </div>
  );
}

function NotFoundInvoice() {
  return (
    <div className="mx-auto max-w-[560px]">
      <Notice tone="warn" title="Invoice not found">
        It may have been a draft that was deleted, or it belongs to another account.
      </Notice>
      <Link to="/invoices" className="btn-secondary mt-4">
        Back to invoices
      </Link>
    </div>
  );
}
