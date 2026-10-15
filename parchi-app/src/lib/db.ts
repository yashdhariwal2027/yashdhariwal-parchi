/* All database reads and writes. Row Level Security in Supabase limits every query to the signed-in seller. */

import { supabase } from "./supabase";
import { fyLabel, todayIST } from "./gst/dates";
import type { InvoiceWrite } from "./invoice/draft";
import type { Business, InvoiceRow, Product } from "./types";

function check<T>(res: { data: T; error: unknown }): T {
  if (res.error) throw res.error;
  return res.data;
}

// ---------- Business ----------

export type BusinessInput = Omit<Business, "user_id">;

export async function getBusiness(): Promise<Business | null> {
  return check(await supabase.from("businesses").select("*").maybeSingle()) as Business | null;
}

export async function createBusiness(input: BusinessInput): Promise<Business> {
  return check(await supabase.from("businesses").insert(input).select("*").single()) as Business;
}

export async function updateBusiness(userId: string, input: Partial<BusinessInput>): Promise<Business> {
  return check(await supabase.from("businesses").update(input).eq("user_id", userId).select("*").single()) as Business;
}

// ---------- Products ----------

export type ProductInput = Omit<Product, "id">;

export async function listProducts(): Promise<Product[]> {
  const rows = check(await supabase.from("products").select("*").order("name", { ascending: true })) as Product[];
  return rows.map((p) => ({ ...p, price: Number(p.price), gst_rate: Number(p.gst_rate) }));
}

export async function createProduct(input: ProductInput): Promise<Product> {
  return check(await supabase.from("products").insert(input).select("*").single()) as Product;
}

export async function updateProduct(id: string, input: Partial<ProductInput>): Promise<Product> {
  return check(await supabase.from("products").update(input).eq("id", id).select("*").single()) as Product;
}

export async function deleteProduct(id: string): Promise<void> {
  check(await supabase.from("products").delete().eq("id", id));
}

// ---------- Invoices ----------

export const LIST_COLUMNS =
  "id,status,doc_type,invoice_no,fy,seq,issue_date,customer_name,customer_phone,customer_gstin,customer_state_code,place_of_supply,payment_mode,payment_status,grand_total,totals,created_at,cancelled_at";

export type InvoiceListRow = Pick<
  InvoiceRow,
  | "id"
  | "status"
  | "doc_type"
  | "invoice_no"
  | "fy"
  | "seq"
  | "issue_date"
  | "customer_name"
  | "customer_phone"
  | "customer_gstin"
  | "customer_state_code"
  | "place_of_supply"
  | "payment_mode"
  | "payment_status"
  | "grand_total"
  | "totals"
  | "created_at"
  | "cancelled_at"
>;

export async function listInvoices(limit = 1000): Promise<InvoiceListRow[]> {
  return check(
    await supabase.from("invoices").select(LIST_COLUMNS).order("created_at", { ascending: false }).limit(limit),
  ) as unknown as InvoiceListRow[];
}

export async function getInvoice(id: string): Promise<InvoiceRow | null> {
  return check(await supabase.from("invoices").select("*").eq("id", id).maybeSingle()) as InvoiceRow | null;
}

export async function saveDraft(id: string | null, row: InvoiceWrite): Promise<InvoiceRow> {
  if (id) {
    return check(await supabase.from("invoices").update(row).eq("id", id).select("*").single()) as InvoiceRow;
  }
  return check(await supabase.from("invoices").insert(row).select("*").single()) as InvoiceRow;
}

export async function deleteDraft(id: string): Promise<void> {
  check(await supabase.from("invoices").delete().eq("id", id).eq("status", "draft"));
}

export async function issueInvoice(id: string): Promise<InvoiceRow> {
  return check(await supabase.rpc("issue_invoice", { p_invoice_id: id })) as InvoiceRow;
}

export async function setPaid(id: string, paid: boolean): Promise<InvoiceRow> {
  return check(
    await supabase.from("invoices").update({ payment_status: paid ? "paid" : "unpaid" }).eq("id", id).select("*").single(),
  ) as InvoiceRow;
}

export async function cancelInvoice(id: string, reason: string): Promise<InvoiceRow> {
  return check(
    await supabase.from("invoices").update({ status: "cancelled", cancel_reason: reason }).eq("id", id).select("*").single(),
  ) as InvoiceRow;
}

/** The number the next invoice dated `date` will probably get (for the confirm step; the database decides). */
export async function nextNumberPreview(prefix: string, date = todayIST()): Promise<string> {
  const fy = fyLabel(date);
  const row = check(await supabase.from("invoice_counters").select("last_seq").eq("fy", fy).maybeSingle()) as { last_seq: number } | null;
  const n = (row?.last_seq ?? 0) + 1;
  return `${prefix}/${fy}/${n < 10000 ? String(n).padStart(4, "0") : n}`;
}
