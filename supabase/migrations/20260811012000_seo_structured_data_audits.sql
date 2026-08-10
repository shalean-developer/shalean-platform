create table if not exists public.seo_structured_data_audits (
  id uuid primary key default gen_random_uuid(),
  url text not null unique,
  path text not null,
  page_group text not null,
  http_status integer,
  json_ld_count integer not null default 0,
  schema_types text[] not null default '{}',
  required_types text[] not null default '{}',
  missing_types text[] not null default '{}',
  errors text[] not null default '{}',
  warnings text[] not null default '{}',
  status text not null default 'unknown' check (status in ('valid','warning','error','unknown')),
  checked_at timestamptz not null default now(),
  raw_summary jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists seo_structured_data_status_idx
  on public.seo_structured_data_audits(status, checked_at desc);
create index if not exists seo_structured_data_group_idx
  on public.seo_structured_data_audits(page_group, status);

alter table public.seo_structured_data_audits enable row level security;
revoke all on public.seo_structured_data_audits from anon, authenticated;
grant all on public.seo_structured_data_audits to service_role;
