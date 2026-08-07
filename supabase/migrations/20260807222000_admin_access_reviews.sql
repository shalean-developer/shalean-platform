-- Priority 4: recurring Owner review of Office access assignments.

create table if not exists public.admin_access_reviews (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.admin_user_roles(id) on delete cascade,
  reviewer_user_id uuid not null,
  outcome text not null check (outcome in ('keep','change_required','revoke_required')),
  notes text null,
  reviewed_at timestamptz not null default now(),
  next_review_at timestamptz not null default (now() + interval '30 days'),
  created_at timestamptz not null default now()
);

create index if not exists admin_access_reviews_assignment_reviewed_idx
  on public.admin_access_reviews (assignment_id, reviewed_at desc);

create index if not exists admin_access_reviews_next_review_idx
  on public.admin_access_reviews (next_review_at);

alter table public.admin_access_reviews enable row level security;

comment on table public.admin_access_reviews is
  'Immutable Owner access-review history for admin_user_roles assignments. Server service-role endpoints enforce audit.view/role.manage.';
