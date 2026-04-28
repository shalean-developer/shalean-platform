-- Tiered dispatch: visibility windows + optional deferred WhatsApp/SMS (cron sends when visible).

alter table public.dispatch_offers
  add column if not exists dispatch_tier text
    check (dispatch_tier is null or dispatch_tier in ('A', 'B', 'C'));

alter table public.dispatch_offers
  add column if not exists dispatch_visible_at timestamptz;

alter table public.dispatch_offers
  add column if not exists dispatch_tier_window_end_at timestamptz;

alter table public.dispatch_offers
  add column if not exists offer_notification_deferred boolean not null default false;

comment on column public.dispatch_offers.dispatch_tier is 'Smart dispatch wave: A (first exclusivity), B, C (broadcast). Null = legacy row.';
comment on column public.dispatch_offers.dispatch_visible_at is 'Offer is hidden from cleaner APIs until this time (null = visible immediately).';
comment on column public.dispatch_offers.dispatch_tier_window_end_at is 'End of exclusive window for this tier wave (analytics).';
comment on column public.dispatch_offers.offer_notification_deferred is 'True when WhatsApp/SMS is deferred until dispatch_visible_at (cron flush).';

create index if not exists dispatch_offers_pending_visible_notify_idx
  on public.dispatch_offers (status, offer_notification_deferred, dispatch_visible_at)
  where status = 'pending' and offer_notification_deferred = true;
