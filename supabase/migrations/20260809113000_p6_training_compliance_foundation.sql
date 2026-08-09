-- P6 workforce training/compliance foundation.

create table if not exists public.workforce_training_modules (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  title text not null,
  description text null,
  category text not null default 'general',
  is_required boolean not null default true,
  validity_days integer null check (validity_days is null or validity_days > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.cleaner_training_assignments (
  id uuid primary key default gen_random_uuid(),
  cleaner_id uuid not null references public.cleaners(id) on delete cascade,
  module_id uuid not null references public.workforce_training_modules(id) on delete restrict,
  status text not null default 'assigned' check (status in ('assigned','in_progress','completed','expired','waived')),
  assigned_at timestamptz not null default now(),
  due_at timestamptz null,
  completed_at timestamptz null,
  expires_at timestamptz null,
  score numeric null check (score is null or (score >= 0 and score <= 100)),
  evidence jsonb not null default '[]'::jsonb,
  assigned_by uuid null references auth.users(id) on delete set null,
  verified_by uuid null references auth.users(id) on delete set null,
  notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cleaner_id, module_id)
);

create table if not exists public.cleaner_compliance_records (
  id uuid primary key default gen_random_uuid(),
  cleaner_id uuid not null references public.cleaners(id) on delete cascade,
  requirement_code text not null,
  requirement_label text not null,
  status text not null default 'missing' check (status in ('missing','pending','valid','expired','rejected','waived')),
  issued_at date null,
  expires_at date null,
  document_path text null,
  verified_at timestamptz null,
  verified_by uuid null references auth.users(id) on delete set null,
  notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cleaner_id, requirement_code)
);

create index if not exists cleaner_training_assignments_status_idx on public.cleaner_training_assignments(status, due_at);
create index if not exists cleaner_compliance_records_status_idx on public.cleaner_compliance_records(status, expires_at);

alter table public.workforce_training_modules enable row level security;
alter table public.cleaner_training_assignments enable row level security;
alter table public.cleaner_compliance_records enable row level security;

revoke all on table public.workforce_training_modules from anon, authenticated;
revoke all on table public.cleaner_training_assignments from anon, authenticated;
revoke all on table public.cleaner_compliance_records from anon, authenticated;
grant all on table public.workforce_training_modules to service_role;
grant all on table public.cleaner_training_assignments to service_role;
grant all on table public.cleaner_compliance_records to service_role;

insert into public.workforce_training_modules(code,title,category,is_required,validity_days)
values
  ('induction','Cleaner induction','onboarding',true,null),
  ('customer-care','Customer care and conduct','service',true,365),
  ('health-safety','Health and safety','safety',true,365),
  ('deep-cleaning','Deep cleaning standard','service',false,365),
  ('move-cleaning','Move cleaning standard','service',false,365)
on conflict (code) do nothing;
