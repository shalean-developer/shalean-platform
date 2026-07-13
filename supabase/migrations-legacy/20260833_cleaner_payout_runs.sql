-- Batched disbursement layer above weekly `cleaner_payouts` rows.
-- Note: `bookings.payout_run_id` is a payment-execution correlation id (UUID), not an FK to this table.

create table if not exists public.cleaner_payout_runs (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'draft'
    check (status in ('draft', 'approved', 'processing', 'paid')),
  total_amount_cents integer not null default 0 check (total_amount_cents >= 0),
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  paid_at timestamptz
);

create index if not exists cleaner_payout_runs_status_idx on public.cleaner_payout_runs (status);
create index if not exists cleaner_payout_runs_created_at_idx on public.cleaner_payout_runs (created_at desc);

comment on table public.cleaner_payout_runs is
  'Admin-controlled disbursement batch grouping multiple cleaner_payouts weekly rows before execution.';

alter table public.cleaner_payouts add column if not exists payout_run_id uuid references public.cleaner_payout_runs (id) on delete set null;
alter table public.cleaner_payouts add column if not exists frozen_at timestamptz;

create index if not exists cleaner_payouts_payout_run_id_idx on public.cleaner_payouts (payout_run_id) where payout_run_id is not null;

alter table public.cleaner_payouts drop constraint if exists cleaner_payouts_status_check;
alter table public.cleaner_payouts
  add constraint cleaner_payouts_status_check
  check (status in ('pending', 'frozen', 'approved', 'paid', 'cancelled'));

comment on column public.cleaner_payouts.payout_run_id is 'Disbursement batch run (`cleaner_payout_runs`); unrelated to `bookings.payout_run_id`.';
comment on column public.cleaner_payouts.frozen_at is 'When this weekly payout row was frozen for batching; amount/cleaner/period must not change after this is set.';

-- Immutability: once frozen, core financial fields cannot change (status transitions and payout_run_id are allowed).
create or replace function public.cleaner_payouts_block_mutate_when_frozen()
returns trigger
language plpgsql
as $$
begin
  if old.frozen_at is not null then
    if new.total_amount_cents is distinct from old.total_amount_cents
      or new.cleaner_id is distinct from old.cleaner_id
      or new.period_start is distinct from old.period_start
      or new.period_end is distinct from old.period_end
    then
      raise exception 'cleaner_payouts % is frozen: cannot change amount, cleaner, or period', old.id;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_cleaner_payouts_block_mutate_when_frozen on public.cleaner_payouts;
create trigger trg_cleaner_payouts_block_mutate_when_frozen
  before update on public.cleaner_payouts
  for each row
  execute function public.cleaner_payouts_block_mutate_when_frozen();
