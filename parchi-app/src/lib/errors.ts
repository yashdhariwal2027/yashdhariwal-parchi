/* Turns database and network errors into sentences a seller can act on. */

const KNOWN: Record<string, string> = {
  invoice_already_issued: "This invoice was already issued.",
  business_not_set_up: "Add your business details in Settings first.",
  doc_type_mismatch: "Your GST registration changed since this draft was made. Open the draft again to update it.",
  issue_date_in_future: "The invoice date can't be in the future.",
  customer_name_required: "Add the customer's name.",
  invoice_has_no_items: "Add at least one item.",
  place_of_supply_required: "Choose the place of supply.",
  item_quantity_invalid: "Every item needs a quantity above 0.",
  item_hsn_required: "Every item needs an HSN code (4, 6 or 8 digits).",
  issue_date_before_last: "An invoice with a later date has already been issued this year. Invoice numbers must follow date order, so use that date or a later one.",
  invoice_series_full: "This year's invoice series is full. Change the invoice prefix in Settings.",
  issued_invoice_cannot_be_edited: "Issued invoices can't be changed.",
  issued_invoice_cannot_be_deleted: "Issued invoices can't be deleted. You can cancel it instead.",
  cancel_reason_required: "Add a reason for cancelling.",
  cancelled_invoice_cannot_change: "This invoice is cancelled and can't be changed.",
  use_issue_invoice: "Use Issue invoice to issue this draft.",
  invoices_must_start_as_draft: "Couldn't save the invoice. Please try again.",
  invoice_not_found: "This invoice doesn't exist or isn't yours.",
  not_signed_in: "Your session has ended. Please sign in again.",
};

export interface DbError {
  message?: string;
  code?: string;
  details?: string | null;
  hint?: string | null;
}

export function friendlyError(e: unknown, fallback = "Something went wrong. Please try again."): string {
  if (!e) return fallback;
  const err = e as DbError & { name?: string };
  const msg = err.message ?? String(e);
  if (KNOWN[msg]) {
    if (msg === "issue_date_before_last" && err.details) {
      return `An invoice dated ${formatIso(err.details)} has already been issued this year. Invoice numbers must follow date order, so use that date or a later one.`;
    }
    return KNOWN[msg];
  }
  if (/Failed to fetch|NetworkError|Load failed|FetchError|fetch failed/i.test(msg)) {
    return "You seem to be offline. Check your internet connection and try again.";
  }
  if (err.code === "23505") return "That already exists.";
  if (err.code === "23514") return "Some details aren't in the right format. Check the highlighted fields.";
  if (err.code === "PGRST301" || /JWT/i.test(msg)) return KNOWN.not_signed_in;
  return fallback;
}

function formatIso(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y) return iso;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}
