-- Phase 6: conversion A/B config + outcomes; extends experiment exposures for multi-arm variants.

-- ---------------------------------------------------------------------------
-- Experiment definitions (weights / rollout per arm; app reads for assignment)
-- ---------------------------------------------------------------------------
create table if not exists public.conversion_experiments (
  id uuid primary key default gen_random_uuid(),
  key text not null,
  variant text not null check (variant in ('control', 'variant_a', 'variant_b')),
  rollout_percentage int not null check (rollout_percentage >= 0 and rollout_percentage <= 100),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (key, variant)
);

create index if not exists conversion_experiments_key_active_idx
  on public.conversion_experiments (key, is_active);

comment on table public.conversion_experiments is
  'Conversion optimization experiment arms; rollout_percentage is share of traffic for that arm (sum per key should be 100).';

alter table public.conversion_experiments enable row level security;

-- ---------------------------------------------------------------------------
-- Measured outcomes per booking (joined to ai_experiment_exposures by subject_id = booking id)
-- ---------------------------------------------------------------------------
create table if not exists public.conversion_experiment_results (
  id uuid primary key default gen_random_uuid(),
  experiment_key text not null,
  variant text not null,
  subject_id text not null,
  user_id uuid references auth.users (id) on delete set null,
  booking_id uuid references public.bookings (id) on delete set null,
  converted boolean not null default false,
  revenue_cents bigint not null default 0 check (revenue_cents >= 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists conversion_experiment_results_key_variant_idx
  on public.conversion_experiment_results (experiment_key, variant, created_at desc);

create index if not exists conversion_experiment_results_booking_idx
  on public.conversion_experiment_results (booking_id)
  where booking_id is not null;

create unique index if not exists conversion_experiment_results_booking_exp_unique
  on public.conversion_experiment_results (booking_id, experiment_key)
  where booking_id is not null;

comment on table public.conversion_experiment_results is
  'Post-payment (or funnel) outcomes attributed to conversion experiments; subject_id matches ai_experiment_exposures.subject_id.';

alter table public.conversion_experiment_results enable row level security;

-- ---------------------------------------------------------------------------
-- Allow multi-arm labels on existing exposures table
-- ---------------------------------------------------------------------------
alter table public.ai_experiment_exposures
  drop constraint if exists ai_experiment_exposures_variant_check;

alter table public.ai_experiment_exposures
  add constraint ai_experiment_exposures_variant_check
  check (variant in ('control', 'variant', 'variant_a', 'variant_b'));

-- ---------------------------------------------------------------------------
-- Seed experiments (50/50 control vs variant_a per key)
-- ---------------------------------------------------------------------------
insert into public.conversion_experiments (key, variant, rollout_percentage, is_active)
values
  ('payment_email_timing', 'control', 50, true),
  ('payment_email_timing', 'variant_a', 50, true),
  ('payment_reminder_timing', 'control', 50, true),
  ('payment_reminder_timing', 'variant_a', 50, true),
  ('email_copy_test', 'control', 50, true),
  ('email_copy_test', 'variant_a', 50, true)
on conflict (key, variant) do nothing;

revoke all on public.conversion_experiments from public;
revoke all on public.conversion_experiments from anon;
revoke all on public.conversion_experiments from authenticated;
grant select, insert, update, delete on public.conversion_experiments to service_role;

revoke all on public.conversion_experiment_results from public;
revoke all on public.conversion_experiment_results from anon;
revoke all on public.conversion_experiment_results from authenticated;
grant select, insert, update, delete on public.conversion_experiment_results to service_role;
