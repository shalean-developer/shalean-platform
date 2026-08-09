-- P6 — Workforce & quality: canonical QA inspection/sign-off layer.
-- Existing cleaner checklist/photo evidence remains the execution source; these tables
-- capture supervisor/admin inspection outcomes, defects, rework, and immutable events.

create table if not exists public.quality_inspections (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  inspection_type text not null default 'supervisor' check (inspection_type in ('supervisor','routine','random','customer_complaint','reinspection')),
  status text not null default 'draft' check (status in ('draft','in_progress','passed','rework_required','failed','closed')),
  inspector_user_id uuid null references auth.users(id) on delete set null,
  inspector_cleaner_id uuid null references public.cleaners(id) on delete set null,
  checklist_required_count integer not null default 0 check (checklist_required_count >= 0),
  checklist_completed_count integer not null default 0 check (checklist_completed_count >= 0 and checklist_completed_count <= checklist_required_count),
  before_photo_sections_count integer not null default 0 check (before_photo_sections_count >= 0),
  after_photo_sections_count integer not null default 0 check (after_photo_sections_count >= 0),
  checklist_score integer null check (checklist_score between 0 and 100),
  photo_score integer null check (photo_score between 0 and 100),
  defect_penalty integer not null default 0 check (defect_penalty between 0 and 100),
  overall_score integer null check (overall_score between 0 and 100),
  signoff_note text null check (signoff_note is null or char_length(signoff_note) <= 5000),
  inspected_at timestamptz null,
  signed_off_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.quality_inspections is
  'Canonical booking QA inspection outcome derived from cleaner checklist/photo evidence plus supervisor/admin defect review.';

create index if not exists quality_inspections_booking_idx
  on public.quality_inspections (booking_id, created_at desc);
create index if not exists quality_inspections_status_idx
  on public.quality_inspections (status, created_at desc);

create table if not exists public.quality_inspection_defects (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid not null references public.quality_inspections(id) on delete cascade,
  section_key text not null check (char_length(btrim(section_key)) between 1 and 80),
  severity text not null check (severity in ('minor','major','critical')),
  description text not null check (char_length(btrim(description)) between 3 and 5000),
  status text not null default 'open' check (status in ('open','fixed','waived')),
  corrective_action text null check (corrective_action is null or char_length(corrective_action) <= 5000),
  due_at timestamptz null,
  resolved_at timestamptz null,
  resolved_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.quality_inspection_defects is
  'Defects identified during a QA inspection. Open defects contribute to the canonical QA score and rework state.';

create index if not exists quality_inspection_defects_inspection_idx
  on public.quality_inspection_defects (inspection_id, status, severity);

create table if not exists public.quality_inspection_events (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid not null references public.quality_inspections(id) on delete cascade,
  event_type text not null check (event_type in ('created','score_refreshed','defect_added','defect_updated','signed_off','reopened','closed')),
  actor_user_id uuid null references auth.users(id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

comment on table public.quality_inspection_events is
  'Append-only audit timeline for QA inspection lifecycle and sign-off actions.';

create index if not exists quality_inspection_events_inspection_idx
  on public.quality_inspection_events (inspection_id, created_at asc);

alter table public.quality_inspections enable row level security;
alter table public.quality_inspection_defects enable row level security;
alter table public.quality_inspection_events enable row level security;

-- These are server-managed workforce/quality records. App APIs use the service role and
-- enforce RBAC explicitly; direct anon/authenticated table access stays closed.
revoke all on table public.quality_inspections from anon, authenticated;
revoke all on table public.quality_inspection_defects from anon, authenticated;
revoke all on table public.quality_inspection_events from anon, authenticated;
grant all on table public.quality_inspections to service_role;
grant all on table public.quality_inspection_defects to service_role;
grant all on table public.quality_inspection_events to service_role;
