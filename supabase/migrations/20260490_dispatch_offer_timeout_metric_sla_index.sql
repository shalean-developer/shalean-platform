-- Dedupe dispatch.offer.timeout (poll + SQL TTL reconcile share one row per offer).
-- Named SLA index (replaces bookings_pending_dispatch_sla_idx from 20260489 if present).

drop index if exists public.bookings_pending_dispatch_sla_idx;

create index if not exists idx_bookings_pending_sla
  on public.bookings (became_pending_at asc)
  where status = 'pending'
    and cleaner_id is null
    and dispatch_status in ('searching', 'offered');

comment on index public.idx_bookings_pending_sla is
  'SLA watchdog: pending unassigned funnel rows ordered by became_pending_at.';

create table if not exists public.dispatch_offer_timeout_metric_emitted (
  offer_id uuid primary key references public.dispatch_offers (id) on delete cascade,
  emitted_at timestamptz not null default now()
);

comment on table public.dispatch_offer_timeout_metric_emitted is
  'At-most-once dispatch.offer.timeout per offer (poll deadline + SQL expire reconcile).';

create index if not exists dispatch_offers_expired_responded_at_idx
  on public.dispatch_offers (responded_at asc)
  where status = 'expired';

alter table public.dispatch_offer_timeout_metric_emitted enable row level security;

revoke all on public.dispatch_offer_timeout_metric_emitted from public;
grant select, insert, delete on public.dispatch_offer_timeout_metric_emitted to service_role;
