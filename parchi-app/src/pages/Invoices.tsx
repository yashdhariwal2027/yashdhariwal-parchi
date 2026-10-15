import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { ChevronRight, FilePlus2, FileSpreadsheet, Search } from "lucide-react";
import { listInvoices, type InvoiceListRow } from "@/lib/db";
import { friendlyError } from "@/lib/errors";
import { formatDate, fyLabel, todayIST } from "@/lib/gst/dates";
import { formatPaise } from "@/lib/gst/money";
import { hsnCsv, registerCsv } from "@/lib/invoice/csv";
import { downloadBlob } from "@/lib/pdf/share";
import { Notice, PageLoading, StatusBadge } from "@/components/ui";
import { cn } from "@/lib/utils";

type Filter = "all" | "draft" | "unpaid" | "paid" | "cancelled";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "unpaid", label: "Unpaid" },
  { id: "paid", label: "Paid" },
  { id: "draft", label: "Drafts" },
  { id: "cancelled", label: "Cancelled" },
];

function matches(i: InvoiceListRow, f: Filter): boolean {
  if (f === "all") return true;
  if (f === "draft" || f === "cancelled") return i.status === f;
  return i.status === "issued" && i.payment_status === f;
}

export function Invoices() {
  const [rows, setRows] = useState<InvoiceListRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [fy, setFy] = useState(fyLabel(todayIST()));

  useEffect(() => {
    listInvoices()
      .then(setRows)
      .catch((e) => setError(friendlyError(e, "Couldn't load your invoices.")));
  }, []);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (rows ?? []).filter(
      (i) =>
        matches(i, filter) &&
        (!needle || i.customer_name.toLowerCase().includes(needle) || (i.invoice_no ?? "").toLowerCase().includes(needle) || i.customer_phone.replace(/\s/g, "").includes(needle.replace(/\s/g, ""))),
    );
  }, [rows, filter, q]);

  const month = todayIST().slice(0, 7);
  const thisMonth = (rows ?? []).filter((i) => i.status === "issued" && i.issue_date.startsWith(month));
  const monthTotal = thisMonth.reduce((s, i) => s + Math.round(Number(i.grand_total) * 100), 0);
  const unpaidTotal = (rows ?? []).filter((i) => i.status === "issued" && i.payment_status === "unpaid").reduce((s, i) => s + Math.round(Number(i.grand_total) * 100), 0);
  const years = [...new Set([(fyLabel(todayIST())), ...(rows ?? []).filter((i) => i.fy).map((i) => i.fy!)])].sort().reverse();
  const fyRows = (rows ?? []).filter((i) => i.fy === fy);

  if (error) {
    return (
      <Notice tone="danger" role="alert" title="Couldn't load invoices">
        {error}
      </Notice>
    );
  }
  if (!rows) return <PageLoading />;

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="h1">Invoices</h1>
        <Link to="/" className="btn-primary btn-sm">
          <FilePlus2 className="h-4 w-4" aria-hidden="true" />
          New invoice
        </Link>
      </div>

      {rows.length === 0 ? (
        <div className="card mt-6 px-5 py-10 text-center">
          <p className="text-[17px] font-semibold">No invoices yet</p>
          <p className="mx-auto mt-1 max-w-[360px] text-muted">Paste your next customer order and Parchi will turn it into an invoice.</p>
          <Link to="/" className="btn-primary mt-5">
            Create your first invoice
          </Link>
        </div>
      ) : (
        <>
          <dl className="mt-5 grid grid-cols-2 gap-3 sm:max-w-[520px]">
            <div className="card p-4">
              <dt className="text-[13px] text-muted">This month</dt>
              <dd className="tabular mt-0.5 text-[20px] font-semibold">{formatPaise(monthTotal, { decimals: false })}</dd>
              <dd className="text-[13px] text-muted">
                {thisMonth.length} {thisMonth.length === 1 ? "invoice" : "invoices"}
              </dd>
            </div>
            <div className="card p-4">
              <dt className="text-[13px] text-muted">Waiting for payment</dt>
              <dd className="tabular mt-0.5 text-[20px] font-semibold">{formatPaise(unpaidTotal, { decimals: false })}</dd>
            </div>
          </dl>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex gap-1.5 overflow-x-auto pb-1" role="group" aria-label="Filter invoices">
              {FILTERS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  aria-pressed={filter === f.id}
                  onClick={() => setFilter(f.id)}
                  className={cn(
                    "min-h-[36px] whitespace-nowrap rounded-full border px-3.5 text-[14px] font-medium",
                    filter === f.id ? "border-brand bg-brand-tint text-brand" : "border-line bg-surface text-muted hover:text-ink",
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <div className="relative sm:w-[280px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden="true" />
              <input
                type="search"
                className="input pl-9"
                placeholder="Search name, number or phone"
                aria-label="Search invoices"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
          </div>

          <ul className="card mt-3 divide-y divide-line overflow-hidden" aria-label="Invoices">
            {shown.length === 0 && <li className="px-4 py-8 text-center text-muted">No invoices match.</li>}
            {shown.map((i) => (
              <li key={i.id}>
                <Link
                  to={i.status === "draft" ? `/drafts/${i.id}` : `/invoices/${i.id}`}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-[#fcfbf8] sm:px-5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className="truncate font-medium">{i.customer_name || "No name yet"}</span>
                      <StatusBadge status={i.status} paid={i.payment_status === "paid"} />
                    </p>
                    <p className="mt-0.5 text-[13px] text-muted">
                      <span className="font-mono">{i.invoice_no ?? "Draft"}</span> · {formatDate(i.issue_date)}
                    </p>
                  </div>
                  <p className={cn("tabular shrink-0 font-semibold", i.status === "cancelled" && "text-muted line-through")}>
                    {formatPaise(Math.round(Number(i.grand_total) * 100))}
                  </p>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>

          <section className="card mt-6 p-4 sm:p-5" aria-labelledby="ca-title">
            <h2 id="ca-title" className="h3">
              For your CA
            </h2>
            <p className="mt-1 text-[14px] text-muted">Spreadsheets of the year's invoices, with GST split by rate, for filing your returns.</p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
              <label className="sr-only" htmlFor="fy">
                Financial year
              </label>
              <select id="fy" className="input sm:w-[160px]" value={fy} onChange={(e) => setFy(e.target.value)}>
                {years.map((y) => (
                  <option key={y} value={y}>
                    FY 20{y}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="btn-secondary"
                disabled={fyRows.length === 0}
                onClick={() => downloadBlob(new Blob([registerCsv(fyRows)], { type: "text/csv" }), `parchi-invoices-FY${fy}.csv`)}
              >
                <FileSpreadsheet className="h-4 w-4" aria-hidden="true" />
                Invoice register
              </button>
              <button
                type="button"
                className="btn-secondary"
                disabled={fyRows.length === 0}
                onClick={() => downloadBlob(new Blob([hsnCsv(fyRows)], { type: "text/csv" }), `parchi-hsn-summary-FY${fy}.csv`)}
              >
                <FileSpreadsheet className="h-4 w-4" aria-hidden="true" />
                HSN summary
              </button>
            </div>
            {fyRows.length === 0 && <p className="hint">No issued invoices in this year yet.</p>}
          </section>
        </>
      )}
    </div>
  );
}
