-- Safe auto-pricing audit trail: AI or admin proposals, validation outcomes, apply/rollback.

create table if not exists public.pricing_changes (
  id uuid primary key default gen_random_uuid(),
  pricing_rule_id uuid references public.pricing_rules (id) on delete set null,
  location text,
  demand_level text,
  old_multiplier numeric,
  new_multiplier numeric not null,
  reason text,
  status text not null default 'pending' check (status in ('pending', 'applied', 'rejected', 'rolled_back')),
  rejection_reason text,
  created_at timestamptz not null default now(),
  applied_at timestamptz,
  rolled_back_at timestamptz,
  created_by text,
  metrics_before jsonb,
  metrics_after jsonb,
  metrics_checked_at timestamptz,
  ai_payload jsonb
);

create index if not exists pricing_changes_status_idx on public.pricing_changes (status);
create index if not exists pricing_changes_rule_idx on public.pricing_changes (pricing_rule_id);
create index if not exists pricing_changes_created_at_idx on public.pricing_changes (created_at desc);

comment on table public.pricing_changes is 'Audit log for pricing rule updates: pending approval, applied, rejected, or rolled back.';
comment on column public.pricing_changes.metrics_before is 'Snapshot (jobs, revenue_cents, profit_cents, margin_ratio) for location before apply, for rollback heuristics.';

alter table public.pricing_changes enable row level security;
