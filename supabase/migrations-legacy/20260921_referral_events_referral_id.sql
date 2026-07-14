-- Link lifecycle analytics rows to operational referrals; idempotent reward/event retries.

alter table public.referral_events
  add column if not exists referral_id uuid references public.referrals (id) on delete set null;

comment on column public.referral_events.referral_id is
  'Optional FK to referrals row for lifecycle/reward projections (checkout rows typically null).';

create index if not exists referral_events_referral_idx on public.referral_events (referral_id, created_at desc)
  where referral_id is not null;

-- Idempotent lifecycle emits (conversion + reward per referral row; distinct event_type).
create unique index if not exists referral_events_unique_lifecycle_event_referral_uidx
  on public.referral_events (event_type, referral_id)
  where referral_id is not null;
