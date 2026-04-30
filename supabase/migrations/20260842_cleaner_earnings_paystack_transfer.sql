-- Paystack-backed payouts for `cleaner_earnings` (approved → processing → paid on transfer.success).
-- Replaces the previous `create_cleaner_earnings_disbursement` behaviour that marked rows paid without a transfer.

-- ---------------------------------------------------------------------------
-- cleaner_earnings: allow `processing` while transfer is in flight
-- ---------------------------------------------------------------------------
alter table public.cleaner_earnings drop constraint if exists cleaner_earnings_status_check;
alter table public.cleaner_earnings
  add constraint cleaner_earnings_status_check
  check (status in ('pending', 'approved', 'processing', 'paid'));

comment on column public.cleaner_earnings.status is
  'pending → approved (admin) → processing (claimed for Paystack) → paid (webhook)';

-- ---------------------------------------------------------------------------
-- Disbursement batch: Paystack metadata
-- ---------------------------------------------------------------------------
alter table public.cleaner_earnings_disbursements add column if not exists paystack_reference text;
alter table public.cleaner_earnings_disbursements add column if not exists transfer_code text;
alter table public.cleaner_earnings_disbursements add column if not exists updated_at timestamptz not null default now();

alter table public.cleaner_earnings_disbursements drop constraint if exists cleaner_earnings_disbursements_status_check;
alter table public.cleaner_earnings_disbursements
  add constraint cleaner_earnings_disbursements_status_check
  check (status in ('pending', 'processing', 'paid', 'failed'));

comment on table public.cleaner_earnings_disbursements is
  'Batch of approved cleaner_earnings sent as one Paystack transfer; status follows transfer lifecycle.';

-- ---------------------------------------------------------------------------
-- Transfer audit (parallel to payout_transfers for weekly cleaner_payouts)
-- ---------------------------------------------------------------------------
create table if not exists public.earnings_disbursement_transfers (
  id uuid primary key default gen_random_uuid(),
  disbursement_id uuid not null references public.cleaner_earnings_disbursements (id) on delete cascade,
  cleaner_id uuid not null references public.cleaners (id) on delete cascade,
  amount_cents integer not null check (amount_cents > 0),
  recipient_code text,
  transfer_code text,
  reference text not null,
  status text not null check (status in ('processing', 'success', 'failed')),
  error text,
  webhook_payload jsonb,
  webhook_processed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists earnings_disbursement_transfers_disbursement_id_idx
  on public.earnings_disbursement_transfers (disbursement_id);
create index if not exists earnings_disbursement_transfers_cleaner_id_idx
  on public.earnings_disbursement_transfers (cleaner_id);
create unique index if not exists earnings_disbursement_transfers_transfer_code_uidx
  on public.earnings_disbursement_transfers (transfer_code)
  where transfer_code is not null;
create unique index if not exists earnings_disbursement_transfers_success_once_uidx
  on public.earnings_disbursement_transfers (disbursement_id)
  where status = 'success';

alter table public.earnings_disbursement_transfers enable row level security;

comment on table public.earnings_disbursement_transfers is
  'Paystack transfer attempts for cleaner_earnings_disbursements; webhook matches transfer_code.';

-- ---------------------------------------------------------------------------
-- Claim approved rows into a disbursement batch (transactional lock)
-- ---------------------------------------------------------------------------
drop function if exists public.create_cleaner_earnings_disbursement(uuid);

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
    select id, amount_cents
    from public.cleaner_earnings
    where cleaner_id = p_cleaner_id
      and status = 'approved'
      and disbursement_id is null
    order by created_at asc
    for update
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
  'Advisory lock, FOR UPDATE on approved unassigned earnings, insert disbursement (processing), link rows as processing.';

revoke all on function public.claim_cleaner_earnings_for_paystack(uuid) from public;
grant execute on function public.claim_cleaner_earnings_for_paystack(uuid) to service_role;
