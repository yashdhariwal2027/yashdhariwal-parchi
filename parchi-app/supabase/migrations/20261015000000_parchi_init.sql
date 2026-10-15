-- Parchi database: businesses, products, invoices, invoice numbering and AI usage limits.
--
-- Run this once in Supabase: Dashboard > SQL Editor > New query > paste this file > Run.
-- It is safe to read top to bottom: every table has Row Level Security, so each seller can only
-- see and change their own rows.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- Indian financial year label for a date: 2026-10-15 -> '26-27', 2027-03-31 -> '26-27', 2027-04-01 -> '27-28'.
create or replace function public.fy_label(d date)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when extract(month from d) >= 4
      then to_char(d, 'YY') || '-' || to_char(d + interval '1 year', 'YY')
    else to_char(d - interval '1 year', 'YY') || '-' || to_char(d, 'YY')
  end
$$;

-- Today's date in India (Supabase servers run on UTC).
create or replace function public.today_ist()
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone 'Asia/Kolkata')::date
$$;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Businesses: one per seller account
-- ---------------------------------------------------------------------------

create table public.businesses (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  legal_name text check (char_length(legal_name) <= 160),
  address text not null default '' check (char_length(address) <= 400),
  state_code text not null check (state_code ~ '^[0-9]{2}$'),
  pincode text check (pincode ~ '^[1-9][0-9]{5}$'),
  phone text check (char_length(phone) <= 20),
  email text check (char_length(email) <= 120),
  -- 'unregistered': not registered under GST (plain invoice, no tax)
  -- 'composition' : composition scheme (bill of supply, no tax collected)
  -- 'regular'     : regular GST registration (tax invoice with GST)
  gst_status text not null check (gst_status in ('unregistered', 'composition', 'regular')),
  gstin text check (gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$'),
  prices_include_gst boolean not null default true,
  invoice_prefix text not null default 'INV' check (invoice_prefix ~ '^[A-Z0-9]{1,4}$'),
  upi_id text check (upi_id ~ '^[A-Za-z0-9._-]{2,255}@[A-Za-z][A-Za-z0-9.-]{1,63}$'),
  logo text check (char_length(logo) <= 400000),
  signature text check (char_length(signature) <= 400000),
  terms text check (char_length(terms) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- A GSTIN is required when registered, and must be empty when not registered.
  constraint businesses_gstin_matches_status check ((gst_status = 'unregistered') = (gstin is null)),
  -- The first two digits of a GSTIN are the state code of the registration.
  constraint businesses_gstin_state check (gstin is null or substr(gstin, 1, 2) = state_code)
);

create trigger businesses_touch before update on public.businesses
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Products: the seller's price list
-- ---------------------------------------------------------------------------

create table public.products (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  -- Other names customers use for it, comma separated ("blue wala kurta, indigo kurta").
  aliases text not null default '' check (char_length(aliases) <= 300),
  price numeric(12, 2) not null check (price >= 0 and price <= 10000000),
  unit text not null default 'PCS'
    check (unit in ('PCS', 'NOS', 'PRS', 'SET', 'PAC', 'BOX', 'DOZ', 'KGS', 'GMS', 'LTR', 'MLT', 'MTR', 'BTL', 'OTH')),
  -- HSN code: 4, 6 or 8 digits.
  hsn text check (hsn ~ '^[0-9]{4}([0-9]{2}){0,2}$'),
  gst_rate numeric(5, 2) not null default 0 check (gst_rate in (0, 0.25, 1.5, 3, 5, 12, 18, 28, 40)),
  -- 'fixed': always gst_rate. 'apparel_2500': clothing/footwear, 5% up to Rs 2,500 per piece, 18% above.
  rate_rule text not null default 'fixed' check (rate_rule in ('fixed', 'apparel_2500')),
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index products_user_idx on public.products (user_id);

create trigger products_touch before update on public.products
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Invoices
-- ---------------------------------------------------------------------------

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  status text not null default 'draft' check (status in ('draft', 'issued', 'cancelled')),
  -- 'tax_invoice' (regular GST), 'bill_of_supply' (composition), 'invoice' (not registered)
  doc_type text not null check (doc_type in ('tax_invoice', 'bill_of_supply', 'invoice')),
  invoice_no text check (char_length(invoice_no) <= 16 and invoice_no ~ '^[A-Za-z0-9/-]+$'),
  fy text check (fy ~ '^[0-9]{2}-[0-9]{2}$'),
  seq integer check (seq > 0),
  issue_date date not null default public.today_ist(),
  customer_name text not null default '' check (char_length(customer_name) <= 120),
  customer_phone text not null default '' check (char_length(customer_phone) <= 20),
  customer_address text not null default '' check (char_length(customer_address) <= 400),
  customer_state_code text check (customer_state_code ~ '^[0-9]{2}$'),
  customer_gstin text check (customer_gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$'),
  place_of_supply text check (place_of_supply ~ '^[0-9]{2}$'),
  payment_mode text not null default '' check (payment_mode in ('', 'cod', 'upi', 'prepaid', 'bank', 'cash', 'other')),
  payment_status text not null default 'unpaid' check (payment_status in ('unpaid', 'paid')),
  paid_at timestamptz,
  notes text not null default '' check (char_length(notes) <= 1000),
  -- Line items exactly as shown on the invoice, with their computed tax (written by the app).
  lines jsonb not null default '[]'::jsonb check (jsonb_typeof(lines) = 'array' and jsonb_array_length(lines) <= 100),
  delivery_charge numeric(12, 2) not null default 0 check (delivery_charge >= 0),
  -- Totals snapshot (taxable value, CGST, SGST/UTGST, IGST, round off, total) written by the app.
  totals jsonb not null default '{}'::jsonb check (jsonb_typeof(totals) = 'object'),
  grand_total numeric(12, 2) not null default 0 check (grand_total >= 0),
  -- Seller details frozen at the moment the invoice was issued.
  seller jsonb,
  issued_at timestamptz,
  cancel_reason text check (char_length(cancel_reason) <= 300),
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint invoices_number_unique unique (user_id, invoice_no),
  constraint invoices_seq_unique unique (user_id, fy, seq),
  constraint invoices_issued_has_number check (status = 'draft' or (invoice_no is not null and fy is not null and seq is not null))
);

create index invoices_user_created_idx on public.invoices (user_id, created_at desc);

-- Issued invoices are permanent records. This trigger makes sure that:
--   * new invoices start as drafts with no number,
--   * a draft becomes 'issued' only through issue_invoice() (which assigns the next number),
--   * issued invoices can't be edited or deleted; only payment status can change, or they can be cancelled,
--   * cancelled invoices stay cancelled (the number is kept, never reused).
create or replace function public.invoices_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  locked_cols text[] := array['payment_status', 'paid_at', 'status', 'cancel_reason', 'cancelled_at', 'updated_at'];
begin
  if tg_op = 'INSERT' then
    if new.status <> 'draft' or new.invoice_no is not null or new.fy is not null or new.seq is not null
       or new.seller is not null or new.issued_at is not null or new.cancelled_at is not null then
      raise exception 'invoices_must_start_as_draft' using errcode = 'P0001';
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    -- pg_trigger_depth() > 1 means this delete comes from deleting the whole account (auth.users cascade),
    -- which only the project owner can do from the Supabase dashboard.
    if old.status <> 'draft' and pg_trigger_depth() <= 1 then
      raise exception 'issued_invoice_cannot_be_deleted' using errcode = 'P0001';
    end if;
    return old;
  end if;

  -- UPDATE
  if new.id <> old.id or new.user_id <> old.user_id then
    raise exception 'invoice_owner_cannot_change' using errcode = 'P0001';
  end if;

  if old.status = 'draft' then
    if new.status = 'draft' then
      if new.invoice_no is not null or new.fy is not null or new.seq is not null or new.seller is not null
         or new.issued_at is not null then
        raise exception 'use_issue_invoice' using errcode = 'P0001';
      end if;
      return new;
    end if;
    if new.status = 'issued' and coalesce(current_setting('parchi.issuing', true), '') = 'on' then
      return new;
    end if;
    raise exception 'use_issue_invoice' using errcode = 'P0001';
  end if;

  -- old.status is 'issued' or 'cancelled'
  if (to_jsonb(new) - locked_cols) is distinct from (to_jsonb(old) - locked_cols) then
    raise exception 'issued_invoice_cannot_be_edited' using errcode = 'P0001';
  end if;

  if new.status = 'draft' then
    raise exception 'issued_invoice_cannot_be_edited' using errcode = 'P0001';
  end if;

  if old.status = 'cancelled' then
    if new.status <> 'cancelled' or new.cancel_reason is distinct from old.cancel_reason
       or new.cancelled_at is distinct from old.cancelled_at then
      raise exception 'cancelled_invoice_cannot_change' using errcode = 'P0001';
    end if;
  elsif new.status = 'cancelled' then
    if coalesce(btrim(new.cancel_reason), '') = '' then
      raise exception 'cancel_reason_required' using errcode = 'P0001';
    end if;
    new.cancelled_at := now();
  elsif new.cancel_reason is distinct from old.cancel_reason or new.cancelled_at is distinct from old.cancelled_at then
    raise exception 'issued_invoice_cannot_be_edited' using errcode = 'P0001';
  end if;

  if new.payment_status = 'paid' and old.payment_status <> 'paid' then
    new.paid_at := now();
  elsif new.payment_status = 'unpaid' then
    new.paid_at := null;
  else
    new.paid_at := old.paid_at;
  end if;

  return new;
end;
$$;

create trigger invoices_guard_ins before insert on public.invoices
  for each row execute function public.invoices_guard();
create trigger invoices_guard_upd before update on public.invoices
  for each row execute function public.invoices_guard();
create trigger invoices_guard_del before delete on public.invoices
  for each row execute function public.invoices_guard();
create trigger invoices_touch before update on public.invoices
  for each row execute function public.touch_updated_at();

-- One running number per seller per financial year. Only issue_invoice() writes here.
create table public.invoice_counters (
  user_id uuid not null references auth.users (id) on delete cascade,
  fy text not null check (fy ~ '^[0-9]{2}-[0-9]{2}$'),
  last_seq integer not null default 0 check (last_seq >= 0),
  primary key (user_id, fy)
);

-- Issues a draft: checks it, gives it the next number in the financial year, and freezes the seller details.
-- Numbers look like INV/26-27/0001 (at most 16 characters, as GST rules require).
create or replace function public.issue_invoice(p_invoice_id uuid)
returns public.invoices
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_inv public.invoices;
  v_biz public.businesses;
  v_expected text;
  v_fy text;
  v_seq integer;
  v_last date;
  v_no text;
  v_line jsonb;
begin
  if v_uid is null then
    raise exception 'not_signed_in' using errcode = '28000';
  end if;

  select * into v_inv from public.invoices where id = p_invoice_id and user_id = v_uid for update;
  if not found then
    raise exception 'invoice_not_found' using errcode = 'P0002';
  end if;
  if v_inv.status <> 'draft' then
    raise exception 'invoice_already_issued' using errcode = 'P0001';
  end if;

  select * into v_biz from public.businesses where user_id = v_uid;
  if not found then
    raise exception 'business_not_set_up' using errcode = 'P0001';
  end if;

  v_expected := case v_biz.gst_status
    when 'regular' then 'tax_invoice'
    when 'composition' then 'bill_of_supply'
    else 'invoice'
  end;
  if v_inv.doc_type <> v_expected then
    raise exception 'doc_type_mismatch' using errcode = 'P0001', detail = v_expected;
  end if;

  if v_inv.issue_date > public.today_ist() then
    raise exception 'issue_date_in_future' using errcode = 'P0001';
  end if;
  if btrim(v_inv.customer_name) = '' then
    raise exception 'customer_name_required' using errcode = 'P0001';
  end if;
  if jsonb_array_length(v_inv.lines) = 0 then
    raise exception 'invoice_has_no_items' using errcode = 'P0001';
  end if;
  if v_inv.doc_type = 'tax_invoice' and v_inv.place_of_supply is null then
    raise exception 'place_of_supply_required' using errcode = 'P0001';
  end if;
  for v_line in select * from jsonb_array_elements(v_inv.lines) loop
    if coalesce((v_line ->> 'qty')::numeric, 0) <= 0 then
      raise exception 'item_quantity_invalid' using errcode = 'P0001';
    end if;
    if v_inv.doc_type in ('tax_invoice', 'bill_of_supply')
       and coalesce(v_line ->> 'hsn', '') !~ '^[0-9]{4}([0-9]{2}){0,2}$' then
      raise exception 'item_hsn_required' using errcode = 'P0001';
    end if;
  end loop;

  v_fy := public.fy_label(v_inv.issue_date);

  -- Lock this seller's counter for the year so two invoices issued at the same moment can't get the same number.
  insert into public.invoice_counters (user_id, fy, last_seq) values (v_uid, v_fy, 0) on conflict do nothing;
  select last_seq into v_seq from public.invoice_counters where user_id = v_uid and fy = v_fy for update;

  -- Numbers must run in date order: no invoice may be dated before the last one issued this year.
  select max(issue_date) into v_last from public.invoices
    where user_id = v_uid and fy = v_fy and status in ('issued', 'cancelled');
  if v_last is not null and v_inv.issue_date < v_last then
    raise exception 'issue_date_before_last' using errcode = 'P0001', detail = v_last::text;
  end if;

  v_seq := v_seq + 1;
  if v_seq > 99999 then
    raise exception 'invoice_series_full' using errcode = 'P0001';
  end if;
  update public.invoice_counters set last_seq = v_seq where user_id = v_uid and fy = v_fy;

  v_no := v_biz.invoice_prefix || '/' || v_fy || '/' ||
    case when v_seq < 10000 then lpad(v_seq::text, 4, '0') else v_seq::text end;

  perform set_config('parchi.issuing', 'on', true);
  update public.invoices set
    status = 'issued',
    fy = v_fy,
    seq = v_seq,
    invoice_no = v_no,
    issued_at = now(),
    seller = jsonb_build_object(
      'name', v_biz.name,
      'legal_name', v_biz.legal_name,
      'address', v_biz.address,
      'state_code', v_biz.state_code,
      'pincode', v_biz.pincode,
      'phone', v_biz.phone,
      'email', v_biz.email,
      'gst_status', v_biz.gst_status,
      'gstin', v_biz.gstin,
      'upi_id', v_biz.upi_id,
      'terms', v_biz.terms
    )
  where id = p_invoice_id
  returning * into v_inv;
  perform set_config('parchi.issuing', 'off', true);

  return v_inv;
end;
$$;

-- ---------------------------------------------------------------------------
-- AI usage limit: protects your Gemini bill. Each seller can read this many orders per day (India time).
-- ---------------------------------------------------------------------------

create table public.parse_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  count integer not null default 0,
  primary key (user_id, day)
);

create or replace function public.consume_parse_quota()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_limit constant integer := 150;
  v_count integer;
begin
  if v_uid is null then
    raise exception 'not_signed_in' using errcode = '28000';
  end if;
  insert into public.parse_usage (user_id, day, count) values (v_uid, public.today_ist(), 1)
    on conflict (user_id, day) do update set count = public.parse_usage.count + 1
    returning count into v_count;
  if v_count > v_limit then
    raise exception 'parse_quota_exceeded' using errcode = 'P0001';
  end if;
  return v_limit - v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security: every seller sees only their own rows
-- ---------------------------------------------------------------------------

alter table public.businesses enable row level security;
alter table public.products enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_counters enable row level security;
alter table public.parse_usage enable row level security;

create policy "own business: read" on public.businesses for select to authenticated
  using (user_id = (select auth.uid()));
create policy "own business: create" on public.businesses for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "own business: update" on public.businesses for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "own products: read" on public.products for select to authenticated
  using (user_id = (select auth.uid()));
create policy "own products: create" on public.products for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "own products: update" on public.products for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own products: delete" on public.products for delete to authenticated
  using (user_id = (select auth.uid()));

create policy "own invoices: read" on public.invoices for select to authenticated
  using (user_id = (select auth.uid()));
create policy "own invoices: create" on public.invoices for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "own invoices: update" on public.invoices for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own invoices: delete drafts" on public.invoices for delete to authenticated
  using (user_id = (select auth.uid()) and status = 'draft');

create policy "own counters: read" on public.invoice_counters for select to authenticated
  using (user_id = (select auth.uid()));
create policy "own usage: read" on public.parse_usage for select to authenticated
  using (user_id = (select auth.uid()));

-- Table and function permissions. Signed-out visitors (anon) get nothing.
revoke all on public.businesses, public.products, public.invoices, public.invoice_counters, public.parse_usage from anon;
grant usage on schema public to authenticated;
grant select, insert, update on public.businesses to authenticated;
grant select, insert, update, delete on public.products to authenticated;
grant select, insert, update, delete on public.invoices to authenticated;
revoke insert, update, delete on public.invoice_counters, public.parse_usage from authenticated;
revoke truncate, references, trigger on public.businesses, public.products, public.invoices, public.invoice_counters, public.parse_usage from authenticated;
grant select on public.invoice_counters, public.parse_usage to authenticated;

revoke execute on function public.issue_invoice(uuid) from public, anon;
revoke execute on function public.consume_parse_quota() from public, anon;
grant execute on function public.issue_invoice(uuid) to authenticated;
grant execute on function public.consume_parse_quota() to authenticated;
