-- MASTER-00B-01 — harden Cleaning Credit reservation storage.
-- Source of truth: service-role-only table. Application access is via server-side
-- admin client and service-role-only SECURITY DEFINER RPCs.
-- RLS is enabled with no policies so non-bypass roles fail closed even if a
-- future table grant is accidentally introduced.

alter table public.cleaning_credit_reservations enable row level security;

revoke all on table public.cleaning_credit_reservations from public, anon, authenticated;
grant all on table public.cleaning_credit_reservations to service_role;

comment on table public.cleaning_credit_reservations is
  'Service-role-only Cleaning Credit reservation ledger. RLS enabled with no client policies; customer-facing reads must go through authorised server routes.';
