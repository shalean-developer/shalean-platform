-- Line-item derived cleaner earnings (snapshot) + per-booking ledger + disbursement batches.
-- Existing `cleaner_payouts` / `cleaner_payout_runs` weekly batching stays unchanged.

-- ---------------------------------------------------------------------------
-- booking_line_items: eligibility + frozen per-line cleaner share (cents)
-- ---------------------------------------------------------------------------
alter table public.booking_line_items
  add column if not exists earns_cleaner boolean not null default true;

alter table public.booking_line_items
  add column if not exists cleaner_earnings_cents integer;

comment on column public.booking_line_items.earns_cleaner is
  'When true, this line contributes to cleaner share of customer line total (see cleaner_earnings_cents).';

comment on column public.booking_line_items.cleaner_earnings_cents is
  'Frozen cleaner share for this line in cents; set once when booking line earnings are finalized.';

-- Bundle / surge / rounding adjustments do not accrue cleaner share by default.
update public.booking_line_items
set earns_cleaner = false
where item_type = 'adjustment';

-- ---------------------------------------------------------------------------
-- bookings: denormalized sum from line items (immutable after finalize)
-- ---------------------------------------------------------------------------
alter table public.bookings
  add column if not exists cleaner_earnings_total_cents integer;

alter table public.bookings
  add column if not exists cleaner_line_earnings_finalized_at timestamptz;

comment on column public.bookings.cleaner_earnings_total_cents is
  'Sum of booking_line_items.cleaner_earnings_cents after one-shot finalize; null until computed.';

comment on column public.bookings.cleaner_line_earnings_finalized_at is
  'When line-item cleaner earnings were frozen; never recompute after this is set.';

-- ---------------------------------------------------------------------------
-- Ledger: one row per completed solo booking (pending → approved → paid)
-- ---------------------------------------------------------------------------
create table if not exists public.cleaner_earnings (
  id uuid primary key default gen_random_uuid(),
  cleaner_id uuid not null references public.cleaners (id) on delete cascade,
  booking_id uuid not null references public.bookings (id) on delete cascade,
  amount_cents integer not null check (amount_cents >= 0),
  status text not null default 'pending' check (status in ('pending', 'approved', 'paid')),
  disbursement_id uuid,
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  paid_at timestamptz
);

create unique index if not exists cleaner_earnings_booking_id_uidx
  on public.cleaner_earnings (booking_id);

create index if not exists cleaner_earnings_cleaner_status_idx
  on public.cleaner_earnings (cleaner_id, status);

comment on table public.cleaner_earnings is
  'Per-booking earnings ledger from frozen line-item totals; distinct from weekly cleaner_payouts batches.';

-- FK to disbursements added after table exists
alter table public.cleaner_earnings
  drop constraint if exists cleaner_earnings_disbursement_id_fkey;

-- ---------------------------------------------------------------------------
-- Disbursement batch (approved ledger rows → paid in one transaction)
-- ---------------------------------------------------------------------------
create table if not exists public.cleaner_earnings_disbursements (
  id uuid primary key default gen_random_uuid(),
  cleaner_id uuid not null references public.cleaners (id) on delete cascade,
  total_amount_cents integer not null check (total_amount_cents >= 0),
  status text not null default 'pending' check (status in ('pending', 'processing', 'paid', 'failed')),
  paystack_transfer_code text,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);

create index if not exists cleaner_earnings_disbursements_cleaner_idx
  on public.cleaner_earnings_disbursements (cleaner_id, created_at desc);

comment on table public.cleaner_earnings_disbursements is
  'Atomic grouping when moving approved cleaner_earnings to paid; avoids double payout via advisory lock + single UPDATE.';

alter table public.cleaner_earnings
  add constraint cleaner_earnings_disbursement_id_fkey
  foreign key (disbursement_id) references public.cleaner_earnings_disbursements (id) on delete set null;

alter table public.cleaner_earnings enable row level security;

drop policy if exists cleaner_earnings_select_assigned on public.cleaner_earnings;
create policy cleaner_earnings_select_assigned on public.cleaner_earnings
  for select to authenticated
  using (
    exists (
      select 1 from public.bookings b
      where b.id = cleaner_earnings.booking_id and b.cleaner_id = auth.uid()
    )
  );

alter table public.cleaner_earnings_disbursements enable row level security;

drop policy if exists cleaner_earnings_disbursements_select_own on public.cleaner_earnings_disbursements;
create policy cleaner_earnings_disbursements_select_own on public.cleaner_earnings_disbursements
  for select to authenticated
  using (cleaner_id = auth.uid());

-- ---------------------------------------------------------------------------
-- RPC: pull all approved earnings for cleaner into one disbursement + mark paid
-- ---------------------------------------------------------------------------
create or replace function public.create_cleaner_earnings_disbursement(p_cleaner_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_disb_id uuid;
  v_total integer;
begin
  if p_cleaner_id is null then
    raise exception 'cleaner_id_required';
  end if;

  perform pg_advisory_xact_lock(910771, abs(hashtext(p_cleaner_id::text)));

  select coalesce(sum(amount_cents), 0)::integer into v_total
  from public.cleaner_earnings
  where cleaner_id = p_cleaner_id and status = 'approved';

  if v_total <= 0 then
    raise exception 'no_approved_earnings';
  end if;

  insert into public.cleaner_earnings_disbursements (cleaner_id, total_amount_cents, status)
  values (p_cleaner_id, v_total, 'processing')
  returning id into v_disb_id;

  update public.cleaner_earnings
  set
    status = 'paid',
    paid_at = now(),
    disbursement_id = v_disb_id
  where cleaner_id = p_cleaner_id and status = 'approved';

  update public.cleaner_earnings_disbursements
  set status = 'paid', paid_at = now()
  where id = v_disb_id;

  return v_disb_id;
end;
$$;

comment on function public.create_cleaner_earnings_disbursement(uuid) is
  'Locks, sums approved cleaner_earnings for cleaner, inserts disbursement, marks rows paid (no double payout).';

revoke all on function public.create_cleaner_earnings_disbursement(uuid) from public;
grant execute on function public.create_cleaner_earnings_disbursement(uuid) to service_role;
