-- Parchi: plans and payments (30-day passes paid through Razorpay).
--
-- Run this once in Supabase > SQL Editor, after the first migration. It is safe to run again: it only
-- creates what's missing and replaces functions with their latest version.
--
-- How it works
--   * A seller buys a 30-day pass for one of three plans. Each pass allows a number of issued invoices and
--     AI order reads. Nothing is issued or read without an active pass.
--   * Passes are created only by the server (api/billing.ts) after Razorpay confirms the payment, using the
--     Supabase secret key. Sellers can read their own passes but never write them.
--   * Buying while a pass still has invoices left queues the new pass to start when the current one ends.
--     Buying after using up the current pass's invoices starts the new pass straight away.

-- ---------------------------------------------------------------------------
-- Plans. Prices are in paise. Change them here (and in api/billing.ts PLANS and src/lib/plans.ts).
-- AI reads allow a little room for reading a message again (20% over the invoice limit).
-- ---------------------------------------------------------------------------

create or replace function public.billing_plan(p_plan text)
returns table (plan text, name text, amount_paise integer, invoice_limit integer, read_limit integer)
language sql
immutable
set search_path = ''
as $$
  select * from (values
    ('starter', 'Starter', 24900, 100, 120),
    ('growth',  'Growth',  34900, 250, 300),
    ('pro',     'Pro',     49900, 500, 600)
  ) as t(plan, name, amount_paise, invoice_limit, read_limit)
  where t.plan = p_plan
$$;

-- ---------------------------------------------------------------------------
-- Passes (one row per checkout attempt; status 'paid' or 'comp' makes it a pass)
-- ---------------------------------------------------------------------------

create table if not exists public.billing_passes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  plan text not null check (plan in ('starter', 'growth', 'pro')),
  amount_paise integer not null check (amount_paise >= 0),
  invoice_limit integer not null check (invoice_limit > 0),
  read_limit integer not null check (read_limit > 0),
  -- created: checkout started. paid: Razorpay confirmed. comp: given free by you (see billing_grant_pass).
  status text not null default 'created' check (status in ('created', 'paid', 'comp')),
  razorpay_order_id text unique,
  razorpay_payment_id text unique,
  invoices_used integer not null default 0 check (invoices_used >= 0),
  reads_used integer not null default 0 check (reads_used >= 0),
  starts_at timestamptz,
  ends_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  check (status = 'created' or (starts_at is not null and ends_at is not null and ends_at > starts_at))
);

create index if not exists billing_passes_user_idx on public.billing_passes (user_id, starts_at);

alter table public.billing_passes enable row level security;
drop policy if exists "own passes: read" on public.billing_passes;
create policy "own passes: read" on public.billing_passes for select to authenticated using (user_id = (select auth.uid()));

revoke all on public.billing_passes from anon, authenticated;
grant select on public.billing_passes to authenticated;
grant select, insert, update on public.billing_passes to service_role;

-- ---------------------------------------------------------------------------
-- The pass in force right now. If it is used up and a paid pass is waiting, the waiting one starts now.
-- Internal: called by the functions below, not by the app directly.
-- ---------------------------------------------------------------------------

create or replace function public.billing_active_pass(p_user_id uuid, p_lock boolean default false)
returns public.billing_passes
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pass public.billing_passes;
  v_next public.billing_passes;
begin
  if p_lock then
    -- One seller's passes are changed one transaction at a time.
    perform pg_advisory_xact_lock(hashtext('parchi-billing:' || p_user_id::text));
  end if;

  select * into v_pass from public.billing_passes
    where user_id = p_user_id and status in ('paid', 'comp') and starts_at <= now() and ends_at > now()
    order by starts_at limit 1;

  if found and p_lock and v_pass.invoices_used >= v_pass.invoice_limit then
    select * into v_next from public.billing_passes
      where user_id = p_user_id and status in ('paid', 'comp') and starts_at > now()
      order by starts_at limit 1;
    if found then
      update public.billing_passes set ends_at = now() where id = v_pass.id;
      update public.billing_passes set starts_at = now(), ends_at = now() + (ends_at - starts_at)
        where id = v_next.id returning * into v_next;
      return v_next;
    end if;
  end if;

  return v_pass; -- all fields null when there is no pass
end;
$$;

-- ---------------------------------------------------------------------------
-- What the app shows on the Plan page
-- ---------------------------------------------------------------------------

create or replace function public.billing_status()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_active public.billing_passes;
  v_next public.billing_passes;
begin
  if v_uid is null then
    raise exception 'not_signed_in' using errcode = '28000';
  end if;
  v_active := public.billing_active_pass(v_uid, false);
  select * into v_next from public.billing_passes
    where user_id = v_uid and status in ('paid', 'comp') and starts_at > now()
    order by starts_at limit 1;
  return jsonb_build_object(
    'active', case when v_active.id is null then null else jsonb_build_object(
      'plan', v_active.plan, 'starts_at', v_active.starts_at, 'ends_at', v_active.ends_at,
      'invoices_used', v_active.invoices_used, 'invoice_limit', v_active.invoice_limit,
      'reads_used', v_active.reads_used, 'read_limit', v_active.read_limit, 'comp', v_active.status = 'comp') end,
    'next', case when v_next.id is null then null else jsonb_build_object(
      'plan', v_next.plan, 'starts_at', v_next.starts_at, 'ends_at', v_next.ends_at) end,
    'now', now()
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Server only (Supabase secret key): checkout and payment
-- ---------------------------------------------------------------------------

-- Before creating a Razorpay order: is this seller allowed to buy, and for how much?
create or replace function public.billing_quote(p_user_id uuid, p_plan text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_amount integer;
begin
  select amount_paise into v_amount from public.billing_plan(p_plan);
  if v_amount is null then
    raise exception 'unknown_plan' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.businesses where user_id = p_user_id) then
    raise exception 'business_not_set_up' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.billing_passes where user_id = p_user_id and status in ('paid', 'comp') and starts_at > now()) then
    raise exception 'pass_already_waiting' using errcode = 'P0001';
  end if;
  return v_amount;
end;
$$;

-- After creating the Razorpay order: remember it, so the payment can be matched to the seller and plan.
create or replace function public.billing_order_created(p_user_id uuid, p_plan text, p_order_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan record;
begin
  select * into v_plan from public.billing_plan(p_plan);
  if v_plan.plan is null then
    raise exception 'unknown_plan' using errcode = 'P0001';
  end if;
  insert into public.billing_passes (user_id, plan, amount_paise, invoice_limit, read_limit, razorpay_order_id)
    values (p_user_id, v_plan.plan, v_plan.amount_paise, v_plan.invoice_limit, v_plan.read_limit, p_order_id);
end;
$$;

-- Razorpay confirmed the payment (from the checkout's signed response or from the webhook, whichever comes
-- first). Safe to call more than once for the same payment. Returns the pass.
create or replace function public.billing_record_payment(p_order_id text, p_payment_id text, p_amount_paise integer)
returns public.billing_passes
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.billing_passes;
  v_active public.billing_passes;
  v_last_end timestamptz;
  v_start timestamptz;
begin
  select * into v_row from public.billing_passes where razorpay_order_id = p_order_id;
  if not found then
    raise exception 'order_not_found' using errcode = 'P0002';
  end if;

  v_active := public.billing_active_pass(v_row.user_id, true); -- also takes the seller's lock
  select * into v_row from public.billing_passes where razorpay_order_id = p_order_id for update;

  if v_row.status = 'paid' then
    if v_row.razorpay_payment_id is distinct from p_payment_id then
      raise exception 'order_already_paid' using errcode = 'P0001';
    end if;
    return v_row; -- already recorded
  end if;
  if p_amount_paise <> v_row.amount_paise then
    raise exception 'amount_mismatch' using errcode = 'P0001';
  end if;

  if v_active.id is not null and v_active.invoices_used >= v_active.invoice_limit then
    -- Current pass used up: the new one starts now.
    update public.billing_passes set ends_at = now() where id = v_active.id;
    v_start := now();
  else
    select max(ends_at) into v_last_end from public.billing_passes
      where user_id = v_row.user_id and status in ('paid', 'comp') and ends_at > now();
    v_start := greatest(now(), coalesce(v_last_end, now()));
  end if;

  update public.billing_passes set
    status = 'paid',
    razorpay_payment_id = p_payment_id,
    paid_at = now(),
    starts_at = v_start,
    ends_at = v_start + interval '30 days'
  where id = v_row.id
  returning * into v_row;
  return v_row;
end;
$$;

-- For you (the owner), from the SQL Editor only: give a seller a free pass, e.g. for your own testing.
--   select public.billing_grant_pass('you@example.com', 'pro');
create or replace function public.billing_grant_pass(p_email text, p_plan text, p_days integer default 30)
returns public.billing_passes
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_plan record;
  v_start timestamptz;
  v_row public.billing_passes;
begin
  select id into v_uid from auth.users where lower(email) = lower(btrim(p_email));
  if v_uid is null then
    raise exception 'No account with the email %', p_email;
  end if;
  select * into v_plan from public.billing_plan(p_plan);
  if v_plan.plan is null then
    raise exception 'Plan must be starter, growth or pro';
  end if;
  perform public.billing_active_pass(v_uid, true);
  select greatest(now(), coalesce(max(ends_at), now())) into v_start from public.billing_passes
    where user_id = v_uid and status in ('paid', 'comp') and ends_at > now();
  insert into public.billing_passes (user_id, plan, amount_paise, invoice_limit, read_limit, status, starts_at, ends_at, paid_at)
    values (v_uid, v_plan.plan, 0, v_plan.invoice_limit, v_plan.read_limit, 'comp', v_start, v_start + make_interval(days => p_days), now())
    returning * into v_row;
  return v_row;
end;
$$;

-- ---------------------------------------------------------------------------
-- Limits: issuing an invoice uses one invoice from the pass; reading an order uses one AI read.
-- ---------------------------------------------------------------------------

create or replace function public.billing_use_invoice()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pass public.billing_passes;
begin
  if old.status = 'draft' and new.status = 'issued' then
    v_pass := public.billing_active_pass(new.user_id, true);
    if v_pass.id is null then
      raise exception 'plan_required' using errcode = 'P0001';
    end if;
    if v_pass.invoices_used >= v_pass.invoice_limit then
      raise exception 'plan_invoice_limit' using errcode = 'P0001';
    end if;
    update public.billing_passes set invoices_used = invoices_used + 1 where id = v_pass.id;
  end if;
  return new;
end;
$$;

drop trigger if exists billing_use_invoice on public.invoices;
create trigger billing_use_invoice before update on public.invoices
  for each row execute function public.billing_use_invoice();

-- Replaces the version in the first migration: still 150 reads a day at most, and now also the pass's limit.
create or replace function public.consume_parse_quota()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_daily constant integer := 150;
  v_count integer;
  v_pass public.billing_passes;
begin
  if v_uid is null then
    raise exception 'not_signed_in' using errcode = '28000';
  end if;
  v_pass := public.billing_active_pass(v_uid, true);
  if v_pass.id is null then
    raise exception 'plan_required' using errcode = 'P0001';
  end if;
  if v_pass.reads_used >= v_pass.read_limit then
    raise exception 'plan_read_limit' using errcode = 'P0001';
  end if;
  insert into public.parse_usage (user_id, day, count) values (v_uid, public.today_ist(), 1)
    on conflict (user_id, day) do update set count = public.parse_usage.count + 1
    returning count into v_count;
  if v_count > v_daily then
    raise exception 'parse_quota_exceeded' using errcode = 'P0001';
  end if;
  update public.billing_passes set reads_used = reads_used + 1 where id = v_pass.id;
  return least(v_daily - v_count, v_pass.read_limit - v_pass.reads_used - 1);
end;
$$;

-- ---------------------------------------------------------------------------
-- Who may call what. (Supabase lets everyone call new functions by default, so this is explicit.)
-- ---------------------------------------------------------------------------

revoke execute on function public.billing_plan(text) from public, anon;
revoke execute on function public.billing_active_pass(uuid, boolean) from public, anon, authenticated, service_role;
revoke execute on function public.billing_status() from public, anon;
revoke execute on function public.billing_quote(uuid, text) from public, anon, authenticated;
revoke execute on function public.billing_order_created(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.billing_record_payment(text, text, integer) from public, anon, authenticated;
revoke execute on function public.billing_grant_pass(text, text, integer) from public, anon, authenticated, service_role;
revoke execute on function public.billing_use_invoice() from public, anon, authenticated, service_role;
revoke execute on function public.consume_parse_quota() from public, anon;

grant execute on function public.billing_plan(text) to authenticated, service_role;
grant execute on function public.billing_status() to authenticated;
grant execute on function public.billing_quote(uuid, text) to service_role;
grant execute on function public.billing_order_created(uuid, text, text) to service_role;
grant execute on function public.billing_record_payment(text, text, integer) to service_role;
grant execute on function public.consume_parse_quota() to authenticated;
