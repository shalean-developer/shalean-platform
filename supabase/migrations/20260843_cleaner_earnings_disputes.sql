-- Cleaner earnings disputes (immutable ledger rows; disputes are separate records).

create table if not exists public.cleaner_earnings_disputes (
  id uuid primary key default gen_random_uuid(),
  cleaner_id uuid not null references public.cleaners (id) on delete cascade,
  booking_id uuid not null references public.bookings (id) on delete cascade,
  reason text not null,
  status text not null default 'open'
    check (status in ('open', 'reviewing', 'resolved', 'rejected')),
  admin_response text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  constraint cleaner_earnings_disputes_reason_len check (char_length(trim(reason)) >= 3)
);

create index if not exists cleaner_earnings_disputes_status_created_idx
  on public.cleaner_earnings_disputes (status, created_at desc);

create index if not exists cleaner_earnings_disputes_cleaner_created_idx
  on public.cleaner_earnings_disputes (cleaner_id, created_at desc);

create index if not exists cleaner_earnings_disputes_booking_idx
  on public.cleaner_earnings_disputes (booking_id);

-- At most one active workflow per cleaner + booking.
create unique index if not exists cleaner_earnings_disputes_active_uidx
  on public.cleaner_earnings_disputes (cleaner_id, booking_id)
  where status in ('open', 'reviewing');

comment on table public.cleaner_earnings_disputes is
  'Cleaner-reported earnings issues; does not mutate cleaner_earnings.';

-- Optional manual credits/debits (separate from frozen line-item ledger).
create table if not exists public.cleaner_earnings_adjustments (
  id uuid primary key default gen_random_uuid(),
  cleaner_id uuid not null references public.cleaners (id) on delete cascade,
  booking_id uuid not null references public.bookings (id) on delete cascade,
  amount_cents integer not null,
  reason text not null,
  dispute_id uuid references public.cleaner_earnings_disputes (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint cleaner_earnings_adjustments_reason_len check (char_length(trim(reason)) >= 2),
  constraint cleaner_earnings_adjustments_amount_nonzero check (amount_cents <> 0)
);

create index if not exists cleaner_earnings_adjustments_cleaner_booking_idx
  on public.cleaner_earnings_adjustments (cleaner_id, booking_id);

comment on table public.cleaner_earnings_adjustments is
  'Manual earnings deltas (+/- cents) applied outside frozen line-item totals; optional link to dispute.';

-- ---------------------------------------------------------------------------
-- RLS: cleaners read own disputes / adjustments (API still uses service_role for writes).
-- ---------------------------------------------------------------------------
alter table public.cleaner_earnings_disputes enable row level security;
alter table public.cleaner_earnings_adjustments enable row level security;

drop policy if exists cleaner_earnings_disputes_select_own on public.cleaner_earnings_disputes;
create policy cleaner_earnings_disputes_select_own on public.cleaner_earnings_disputes
  for select to authenticated
  using (
    exists (
      select 1 from public.cleaners c
      where c.id = cleaner_earnings_disputes.cleaner_id
        and (c.auth_user_id = auth.uid() or c.id = auth.uid())
    )
  );

drop policy if exists cleaner_earnings_adjustments_select_own on public.cleaner_earnings_adjustments;
create policy cleaner_earnings_adjustments_select_own on public.cleaner_earnings_adjustments
  for select to authenticated
  using (
    exists (
      select 1 from public.cleaners c
      where c.id = cleaner_earnings_adjustments.cleaner_id
        and (c.auth_user_id = auth.uid() or c.id = auth.uid())
    )
  );

revoke all on public.cleaner_earnings_disputes from public;
grant select on public.cleaner_earnings_disputes to authenticated;
grant all on public.cleaner_earnings_disputes to service_role;

revoke all on public.cleaner_earnings_adjustments from public;
grant select on public.cleaner_earnings_adjustments to authenticated;
grant all on public.cleaner_earnings_adjustments to service_role;
