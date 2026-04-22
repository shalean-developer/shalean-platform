create table if not exists public.cleaner_applications (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text not null,
  location text not null,
  experience text,
  availability text,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now()
);

create index if not exists cleaner_applications_status_idx
  on public.cleaner_applications (status, created_at desc);
