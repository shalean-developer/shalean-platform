-- Closed-loop growth learning: tie outbound growth actions to paid conversions.

create table if not exists public.growth_action_outcomes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  action_type text not null,
  channel text not null check (channel in ('email', 'whatsapp', 'sms')),
  sent_at timestamptz not null default now(),
  converted boolean not null default false,
  conversion_time timestamptz,
  /** Stored in cents (ZAR minor units) for consistency with bookings. */
  revenue_generated bigint not null default 0 check (revenue_generated >= 0),
  booking_id uuid references public.bookings (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists growth_action_outcomes_user_sent_idx
  on public.growth_action_outcomes (user_id, sent_at desc);

create index if not exists growth_action_outcomes_action_converted_idx
  on public.growth_action_outcomes (action_type, channel, converted);

create index if not exists growth_action_outcomes_booking_idx
  on public.growth_action_outcomes (booking_id)
  where booking_id is not null;

comment on table public.growth_action_outcomes is
  'Growth send → conversion attribution for learnGrowthEffectiveness() (Phase 4 learning loop).';

alter table public.growth_action_outcomes enable row level security;
