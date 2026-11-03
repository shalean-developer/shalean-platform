-- Stage 03: durable cursor for bounded metadata-only Zoho polling.
create table if not exists public.accounting_invoice_refresh_cursor (
  name text primary key,
  last_id uuid not null default '00000000-0000-0000-0000-000000000000'::uuid,
  updated_at timestamptz not null default now()
);
alter table public.accounting_invoice_refresh_cursor enable row level security;
revoke all on public.accounting_invoice_refresh_cursor from anon, authenticated;
grant select, insert, update on public.accounting_invoice_refresh_cursor to service_role;
insert into public.accounting_invoice_refresh_cursor(name)
values ('zoho_invoice_status')
on conflict (name) do nothing;
