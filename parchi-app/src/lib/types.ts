import type { DocType, GstStatus, RateRule, Unit } from "./gst/calc";

/** Row in public.businesses */
export interface Business {
  user_id: string;
  name: string;
  legal_name: string | null;
  address: string;
  state_code: string;
  pincode: string | null;
  phone: string | null;
  email: string | null;
  gst_status: GstStatus;
  gstin: string | null;
  prices_include_gst: boolean;
  invoice_prefix: string;
  upi_id: string | null;
  logo: string | null;
  signature: string | null;
  terms: string | null;
}

/** Row in public.products */
export interface Product {
  id: string;
  name: string;
  aliases: string;
  price: number;
  unit: Unit;
  hsn: string | null;
  gst_rate: number;
  rate_rule: RateRule;
  archived: boolean;
}

export type PaymentMode = "" | "cod" | "upi" | "prepaid" | "bank" | "cash" | "other";

export const PAYMENT_LABELS: Record<Exclude<PaymentMode, "">, string> = {
  cod: "Cash on delivery",
  upi: "UPI",
  prepaid: "Paid in advance",
  bank: "Bank transfer",
  cash: "Cash",
  other: "Other",
};

/** Something on the draft that the seller should look at before issuing (an uncertain AI read). */
export interface CheckFlag {
  field: string;
  reason: string;
}

export interface DraftLine {
  key: string;
  productId: string | null;
  name: string;
  /** Size, colour and other variant details, printed after the name */
  variant: string;
  hsn: string;
  qty: number;
  unit: Unit;
  price: number;
  discount: number;
  gstRate: number;
  rateRule: RateRule;
  /** false until the seller picks a GST rate for an item that isn't from their products (missing = chosen, for older drafts) */
  rateSet?: boolean;
  /** Seller ticked "Save to my products" on an item that isn't in their products */
  saveAsProduct?: boolean;
  checks: CheckFlag[];
}

export interface Draft {
  /** Database id once saved */
  id: string | null;
  issueDate: string;
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  customerStateCode: string | null;
  customerGstin: string;
  placeOfSupply: string | null;
  lines: DraftLine[];
  delivery: number;
  paymentMode: PaymentMode;
  notes: string;
  /** Customer-level checks (name, state, phone...) */
  checks: CheckFlag[];
}

/** One line as stored on an invoice row (amounts in paise). */
export interface StoredLine {
  product_id: string | null;
  name: string;
  variant: string;
  hsn: string;
  qty: number;
  unit: Unit;
  price: number;
  discount: number;
  gst_rate: number;
  rate_rule: RateRule;
  /** Only stored on drafts: false while the GST rate hasn't been chosen */
  rate_set?: boolean;
  /** Only stored on drafts: "Save to my products" is ticked */
  save_product?: boolean;
  rate: number;
  gross_p: number;
  taxable_p: number;
  cgst_p: number;
  sgst_p: number;
  igst_p: number;
  total_p: number;
}

export interface StoredTotals {
  v: 1;
  title: string;
  charges_gst: boolean;
  prices_include_gst: boolean;
  intra_state: boolean | null;
  state_tax_label: "SGST" | "UTGST";
  taxable_p: number;
  cgst_p: number;
  sgst_p: number;
  igst_p: number;
  tax_p: number;
  exact_p: number;
  round_off_p: number;
  grand_total_p: number;
  delivery: null | { gross_p: number; rate: number; taxable_p: number; cgst_p: number; sgst_p: number; igst_p: number; total_p: number };
  summary: { hsn: string; rate: number; taxable_p: number; cgst_p: number; sgst_p: number; igst_p: number }[];
  amount_in_words: string;
}

export interface SellerSnapshot {
  name: string;
  legal_name: string | null;
  address: string;
  state_code: string;
  pincode: string | null;
  phone: string | null;
  email: string | null;
  gst_status: GstStatus;
  gstin: string | null;
  upi_id: string | null;
  terms: string | null;
}

/** Row in public.invoices */
export interface InvoiceRow {
  id: string;
  user_id: string;
  status: "draft" | "issued" | "cancelled";
  doc_type: DocType;
  invoice_no: string | null;
  fy: string | null;
  seq: number | null;
  issue_date: string;
  customer_name: string;
  customer_phone: string;
  customer_address: string;
  customer_state_code: string | null;
  customer_gstin: string | null;
  place_of_supply: string | null;
  payment_mode: PaymentMode;
  payment_status: "unpaid" | "paid";
  paid_at: string | null;
  notes: string;
  lines: StoredLine[];
  delivery_charge: number;
  totals: StoredTotals | Record<string, never>;
  grand_total: number;
  seller: SellerSnapshot | null;
  issued_at: string | null;
  cancel_reason: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
}
