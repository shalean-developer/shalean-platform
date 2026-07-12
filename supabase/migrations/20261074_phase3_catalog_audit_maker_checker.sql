-- Phase 3: catalog audit trail + maker–checker proposals for earnings adjustments.

create table if not exists public.pricing_catalog_audit (
  id uuid primary key default gen_random_uuid(),
  table_name text not null
    check (table_name in ('pricing_services', 'pricing_extras', 'pricing_booking_config')),
  row_id text not null,
  action text not null check (action in ('insert', 'update', 'delete')),
  before_row jsonb,
  after_row jsonb,
  actor_user_id uuid,
  actor_email text,
  created_at timestamptz not null default now()
);

create index if not exists pricing_catalog_audit_table_created_idx
  on public.pricing_catalog_audit (table_name, created_at desc);

create index if not exists pricing_catalog_audit_row_idx
  on public.pricing_catalog_audit (table_name, row_id, created_at desc);

comment on table public.pricing_catalog_audit is
  'Phase 3 audit log for admin catalog CRUD (services, extras, booking config).';

create table if not exists public.admin_money_action_proposals (
  id uuid primary key default gen_random_uuid(),
  action_type text not null check (action_type in ('adjust_payout_earnings', 'adjust_team_payout_earnings')),
  booking_id uuid not null references public.bookings (id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  proposed_by uuid not null,
  proposed_by_email text,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'expired')),
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours')
);

create index if not exists admin_money_action_proposals_pending_idx
  on public.admin_money_action_proposals (booking_id, status)
  where status = 'pending';

comment on table public.admin_money_action_proposals is
  'Phase 3 maker–checker proposals for earnings adjustments when PAYOUT_MAKER_CHECKER=true.';
