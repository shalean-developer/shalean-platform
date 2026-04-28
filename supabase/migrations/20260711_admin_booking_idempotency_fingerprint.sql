-- Safe if 20260710 was skipped or an older revision created the table without fingerprint columns.
-- 1) Create full table when missing (e.g. SQL editor ran only this file).
-- 2) Upgrade legacy tables that lack service_slug / location_hash or still use the 5-column unique key.

create table if not exists public.admin_booking_create_idempotency (
  id uuid primary key default gen_random_uuid(),
  idempotency_key text not null,
  route text not null,
  customer_user_id uuid not null,
  service_date text not null,
  service_time text not null,
  service_slug text not null default '',
  location_hash text not null default '',
  pending boolean not null default true,
  status_code smallint,
  response_body jsonb,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

alter table public.admin_booking_create_idempotency
  add column if not exists service_slug text not null default '';

alter table public.admin_booking_create_idempotency
  add column if not exists location_hash text not null default '';

alter table public.admin_booking_create_idempotency
  drop constraint if exists admin_booking_create_idempotency_uid;

alter table public.admin_booking_create_idempotency
  add constraint admin_booking_create_idempotency_uid unique (
    idempotency_key,
    route,
    customer_user_id,
    service_date,
    service_time,
    service_slug,
    location_hash
  );

create index if not exists admin_booking_create_idempotency_expires_idx
  on public.admin_booking_create_idempotency (expires_at);

comment on table public.admin_booking_create_idempotency is
  'Short-lived idempotency for admin booking create: key + route + customer + slot + service + location fingerprint.';

comment on column public.admin_booking_create_idempotency.service_slug is
  'Normalized service id from admin create (e.g. quick, standard). Part of idempotency fingerprint.';

comment on column public.admin_booking_create_idempotency.location_hash is
  'SHA-256 hex prefix of normalized first address line; fingerprint only (not reversible).';

alter table public.admin_booking_create_idempotency enable row level security;

grant select, insert, update, delete on public.admin_booking_create_idempotency to service_role;
