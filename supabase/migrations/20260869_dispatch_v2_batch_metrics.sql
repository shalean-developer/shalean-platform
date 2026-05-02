-- Dispatch v2: batch metadata on offers, cleaner last_active_at, peer expiry by batch, dispatch_metrics.

alter table public.dispatch_offers
  add column if not exists batch_id uuid,
  add column if not exists priority_score numeric not null default 0,
  add column if not exists sent_rank integer,
  add column if not exists attempts integer not null default 0;

comment on column public.dispatch_offers.batch_id is 'Shared id for one dispatch wave (parallel or ranked batch).';
comment on column public.dispatch_offers.priority_score is 'Pre-offer composite ranking score (Dispatch v2).';
comment on column public.dispatch_offers.sent_rank is '0-based order within batch when offers were sent.';
comment on column public.dispatch_offers.attempts is 'Dispatch attempt / wave number when the row was created.';

create index if not exists dispatch_offers_batch_pending_idx
  on public.dispatch_offers (batch_id, status)
  where batch_id is not null and status = 'pending';

alter table public.cleaners
  add column if not exists last_active_at timestamptz;

comment on column public.cleaners.last_active_at is 'Last meaningful cleaner-app activity (optional; used for dispatch ranking).';

create table if not exists public.dispatch_metrics (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id) on delete cascade,
  cleaner_id uuid not null references public.cleaners (id) on delete restrict,
  time_to_accept_ms integer not null check (time_to_accept_ms >= 0),
  offers_sent integer not null default 0 check (offers_sent >= 0),
  created_at timestamptz not null default now()
);

create index if not exists dispatch_metrics_booking_idx on public.dispatch_metrics (booking_id);
create index if not exists dispatch_metrics_cleaner_idx on public.dispatch_metrics (cleaner_id);

comment on table public.dispatch_metrics is 'Dispatch v2: one row per successful marketplace accept (KPI / fairness).';

alter table public.dispatch_metrics enable row level security;

-- No direct client access; service role bypasses RLS.
drop policy if exists dispatch_metrics_service_only on public.dispatch_metrics;
create policy dispatch_metrics_service_only on public.dispatch_metrics
  for all
  to authenticated
  using (false)
  with check (false);

-- Extend peer expiry: same booking (legacy) + same batch_id when set (v2 parallel batches).
create or replace function public.dispatch_expire_peer_offers(p_booking_id uuid, p_winner_offer_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch uuid;
begin
  select batch_id into v_batch
  from public.dispatch_offers
  where id = p_winner_offer_id;

  update public.dispatch_offers
  set
    status = 'expired',
    responded_at = now()
  where booking_id = p_booking_id
    and status = 'pending'
    and id <> p_winner_offer_id;

  if v_batch is not null then
    update public.dispatch_offers
    set
      status = 'expired',
      responded_at = now()
    where batch_id = v_batch
      and status = 'pending'
      and id <> p_winner_offer_id;
  end if;
end;
$$;

comment on function public.dispatch_expire_peer_offers(uuid, uuid) is
  'Expire pending sibling offers for the booking; also expire pending offers in the same batch_id (Dispatch v2).';
