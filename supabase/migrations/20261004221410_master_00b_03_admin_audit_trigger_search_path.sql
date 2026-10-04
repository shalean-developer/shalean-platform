-- MASTER-00B-03 — pin search_path for the append-only admin audit trigger.
-- The body only raises a fixed exception and requires no application schemas.

alter function public.prevent_admin_audit_mutation()
  set search_path = pg_catalog;
