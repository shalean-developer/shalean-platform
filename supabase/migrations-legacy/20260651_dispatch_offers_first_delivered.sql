-- Phase 8E: Meta delivered receipt time for read-based escalation (optional; nullable).

alter table public.dispatch_offers
  add column if not exists first_delivered_at timestamptz;

comment on column public.dispatch_offers.first_delivered_at is
  'First Meta delivered webhook time for this offer wamid (Phase 8E escalation).';
