-- Cached customer contact success stats (fed from notification writes; read for routing).

create table if not exists public.customer_contact_health (
  phone_key text primary key,
  success_rate double precision not null check (success_rate >= 0 and success_rate <= 1),
  sample_size integer not null check (sample_size >= 0 and sample_size <= 50),
  last_updated timestamptz not null default now()
);

comment on table public.customer_contact_health is
  'Rolling customer outbound health by normalized phone_key (E.164 preferred, else digits:lastN).';

comment on column public.customer_contact_health.phone_key is
  'Canonical key: E.164 when known, else digits:<suffix> for legacy/local recipient strings.';

create index if not exists customer_contact_health_last_updated_idx
  on public.customer_contact_health (last_updated desc);

alter table public.customer_contact_health enable row level security;
