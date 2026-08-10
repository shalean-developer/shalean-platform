-- Allow one cleaner profile to be reached by an additional trusted Auth user.
-- This preserves the cleaner's original phone login while a supervisor uses
-- the same @shalean.com login for both Office and their own cleaner portal.

create table if not exists public.cleaner_auth_links (
  cleaner_id uuid not null references public.cleaners(id) on delete cascade,
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  link_type text not null default 'supervisor' check (link_type in ('supervisor','admin_alias')),
  is_active boolean not null default true,
  linked_by uuid null references auth.users(id) on delete set null,
  reason text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (cleaner_id, auth_user_id),
  unique (auth_user_id)
);

create index if not exists cleaner_auth_links_cleaner_active_idx
  on public.cleaner_auth_links(cleaner_id, is_active);

alter table public.cleaner_auth_links enable row level security;
revoke all on table public.cleaner_auth_links from anon, authenticated;
grant all on table public.cleaner_auth_links to service_role;

comment on table public.cleaner_auth_links is
  'Additional audited Auth identities allowed to open an existing cleaner profile; canonical cleaner login remains cleaners.auth_user_id.';

-- Repair the four current supervisors without replacing or deleting their
-- existing cleaner Auth identities. Missing rows in non-production
-- environments simply produce no inserts.
insert into public.cleaner_auth_links (cleaner_id, auth_user_id, link_type, reason)
select c.id, u.id, 'supervisor', 'Initial supervisor/cleaner account convergence'
from (values
  ('lucia@shalean.com', 'Lucia Chiuta'),
  ('marvelous@shalean.com', 'Marvellous Muneri'),
  ('normatter@shalean.com', 'Normatter Mazhinji'),
  ('thandeka@shalean.com', 'Mavis Thandeka Gurajena')
) as mapping(supervisor_email, cleaner_name)
join auth.users u on lower(u.email) = mapping.supervisor_email
join public.cleaners c on c.full_name = mapping.cleaner_name
join public.admin_user_roles ur on ur.user_id = u.id
join public.admin_roles r on r.id = ur.role_id and r.code = 'supervisor'
where ur.revoked_at is null
  and ur.starts_at <= now()
  and (ur.expires_at is null or ur.expires_at > now())
on conflict (cleaner_id, auth_user_id) do update set
  is_active = true,
  link_type = excluded.link_type,
  reason = excluded.reason,
  updated_at = now();

-- Supervisor accounts are Office identities, not customer identities. This
-- keeps post-auth routing semantically aligned with the active RBAC role.
update public.user_profiles up
set role = 'admin', updated_at = now()
where exists (
  select 1
  from public.admin_user_roles ur
  join public.admin_roles r on r.id = ur.role_id and r.code = 'supervisor'
  where ur.user_id = up.id
    and ur.revoked_at is null
    and ur.starts_at <= now()
    and (ur.expires_at is null or ur.expires_at > now())
);

