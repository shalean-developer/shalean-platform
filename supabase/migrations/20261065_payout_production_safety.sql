-- Production payout safety: transfer outbox, immutable references, dual-rail claim gate,
-- booking paid sync RPCs, structured payout audit events.
-- Additive / backward-compatible. Does not change cleaner earnings business rules.

-- ---------------------------------------------------------------------------
-- payout_transfers: durable client reference (immutable idempotency key)
-- ---------------------------------------------------------------------------
alter table public.payout_transfers
  add column if not exists reference text;

update public.payout_transfers
set reference = coalesce(nullif(trim(transfer_code), ''), 'legacy-' || id::text)
where reference is null;

alter table public.payout_transfers
  alter column reference set not null;

create unique index if not exists payout_transfers_reference_uidx
  on public.payout_transfers (reference);

comment on column public.payout_transfers.reference is
  'Immutable Paystack client reference (e.g. shalean-cleaner-payout-{payout_id}). Never regenerated on retry.';

-- ---------------------------------------------------------------------------
-- Unified transfer outbox (both weekly + ledger rails)
-- ---------------------------------------------------------------------------
create table if not exists public.payout_transfer_outbox (
  id uuid primary key default gen_random_uuid(),
  rail text not null check (rail in ('cleaner_payout', 'cleaner_earnings')),
  subject_id uuid not null,
  cleaner_id uuid not null references public.cleaners (id) on delete cascade,
  amount_cents integer not null check (amount_cents > 0),
  recipient_code text not null,
  reference text not null,
  transfer_row_id uuid,
  status text not null default 'pending'
    check (status in ('pending', 'submitted', 'succeeded', 'failed', 'needs_reconcile')),
  transfer_code text,
  paystack_response jsonb,
  attempts integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payout_transfer_outbox_reference_unique unique (reference)
);

create index if not exists payout_transfer_outbox_status_created_idx
  on public.payout_transfer_outbox (status, created_at)
  where status in ('pending', 'needs_reconcile');

create unique index if not exists payout_transfer_outbox_active_subject_uidx
  on public.payout_transfer_outbox (rail, subject_id)
  where status in ('pending', 'submitted', 'needs_reconcile', 'succeeded');

alter table public.payout_transfer_outbox enable row level security;

comment on table public.payout_transfer_outbox is
  'Durable Paystack transfer intent. Inserted before calling Paystack; worker/reconcile resume without new references.';

-- ---------------------------------------------------------------------------
-- Structured payout audit (admin + system money-path events)
-- ---------------------------------------------------------------------------
create table if not exists public.payout_audit_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  actor_user_id uuid,
  actor_email text,
  payout_id uuid,
  disbursement_id uuid,
  booking_ids uuid[],
  amount_cents integer,
  old_values jsonb,
  new_values jsonb,
  reference text,
  ip text,
  context jsonb,
  created_at timestamptz not null default now()
);

create index if not exists payout_audit_events_created_idx
  on public.payout_audit_events (created_at desc);
create index if not exists payout_audit_events_payout_id_idx
  on public.payout_audit_events (payout_id)
  where payout_id is not null;
create index if not exists payout_audit_events_type_idx
  on public.payout_audit_events (event_type);

alter table public.payout_audit_events enable row level security;

comment on table public.payout_audit_events is
  'Append-only audit for payout generate/approve/pay/adjust/webhook/retry events.';

-- ---------------------------------------------------------------------------
-- Track who created a batch (maker–checker)
-- ---------------------------------------------------------------------------
alter table public.cleaner_payouts
  add column if not exists created_by uuid;

comment on column public.cleaner_payouts.created_by is
  'Auth user id of admin who generated the batch (null for cron/system). Used for optional maker–checker.';

-- ---------------------------------------------------------------------------
-- Claim gate: exclude bookings already on weekly rail or paid / refunded
-- ---------------------------------------------------------------------------
create or replace function public.claim_cleaner_earnings_for_paystack(p_cleaner_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_disb_id uuid;
  v_total integer;
  v_ids uuid[];
begin
  if p_cleaner_id is null then
    raise exception 'cleaner_id_required';
  end if;

  perform pg_advisory_xact_lock(910772, abs(hashtext(p_cleaner_id::text)));

  select coalesce(array_agg(id), '{}'::uuid[]), coalesce(sum(amount_cents), 0)::integer
  into v_ids, v_total
  from (
    select ce.id, ce.amount_cents
    from public.cleaner_earnings ce
    inner join public.bookings b on b.id = ce.booking_id
    where ce.cleaner_id = p_cleaner_id
      and ce.status = 'approved'
      and ce.disbursement_id is null
      and b.payout_id is null
      and lower(coalesce(b.payout_status, '')) is distinct from 'paid'
      and b.payout_paid_at is null
      and b.refunded_at is null
      and lower(coalesce(b.refund_status, '')) not in ('refunded', 'partial_refund', 'reversed')
      and lower(coalesce(b.status, '')) = 'completed'
    order by ce.created_at asc
    for update of ce
  ) s;

  if v_total is null or v_total <= 0 or v_ids is null or cardinality(v_ids) = 0 then
    raise exception 'no_approved_earnings';
  end if;

  insert into public.cleaner_earnings_disbursements (cleaner_id, total_amount_cents, status)
  values (p_cleaner_id, v_total, 'processing')
  returning id into v_disb_id;

  update public.cleaner_earnings
  set
    disbursement_id = v_disb_id,
    status = 'processing'
  where id = any(v_ids);

  return v_disb_id;
end;
$$;

comment on function public.claim_cleaner_earnings_for_paystack(uuid) is
  'Advisory lock + FOR UPDATE; claims approved ledger rows not already on weekly payout rail / paid / refunded.';

-- ---------------------------------------------------------------------------
-- Sync bookings.payout_status=paid when a weekly batch transfer succeeds
-- ---------------------------------------------------------------------------
create or replace function public.mark_bookings_paid_for_cleaner_payout(p_payout_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
begin
  if p_payout_id is null then
    return 0;
  end if;

  update public.bookings b
  set
    payout_status = 'paid',
    payout_paid_at = coalesce(b.payout_paid_at, now())
  where b.payout_id = p_payout_id
    and (
      lower(coalesce(b.payout_status, '')) is distinct from 'paid'
      or b.payout_paid_at is null
    );

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

comment on function public.mark_bookings_paid_for_cleaner_payout(uuid) is
  'Idempotent: sets linked bookings to payout_status=paid when weekly batch Paystack succeeds or manual mark-paid.';

revoke all on function public.mark_bookings_paid_for_cleaner_payout(uuid) from public;
grant execute on function public.mark_bookings_paid_for_cleaner_payout(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Sync booking paid when ledger disbursement succeeds
-- ---------------------------------------------------------------------------
create or replace function public.mark_bookings_paid_for_earnings_disbursement(p_disbursement_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
begin
  if p_disbursement_id is null then
    return 0;
  end if;

  update public.bookings b
  set
    payout_status = 'paid',
    payout_paid_at = coalesce(b.payout_paid_at, now())
  from public.cleaner_earnings ce
  where ce.disbursement_id = p_disbursement_id
    and ce.booking_id = b.id
    and (
      lower(coalesce(b.payout_status, '')) is distinct from 'paid'
      or b.payout_paid_at is null
    );

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

comment on function public.mark_bookings_paid_for_earnings_disbursement(uuid) is
  'Idempotent: marks bookings paid for earnings rows in a successful ledger disbursement.';

revoke all on function public.mark_bookings_paid_for_earnings_disbursement(uuid) from public;
grant execute on function public.mark_bookings_paid_for_earnings_disbursement(uuid) to service_role;

-- Keep claim execute grants
revoke all on function public.claim_cleaner_earnings_for_paystack(uuid) from public;
grant execute on function public.claim_cleaner_earnings_for_paystack(uuid) to service_role;
