-- Prepared guard: does not validate existing rows until you run VALIDATE CONSTRAINT.
-- New rows should populate price_snapshot on priced paths; legacy rows may be null until backfill.
--
-- Column is normally added in 20260839; keep here so this migration is safe if 20260839 was skipped.

alter table public.bookings
  add column if not exists price_snapshot jsonb;

alter table public.bookings
  drop constraint if exists bookings_price_snapshot_required_check;

alter table public.bookings
  add constraint bookings_price_snapshot_required_check
  check (price_snapshot is not null)
  not valid;

comment on constraint bookings_price_snapshot_required_check on public.bookings is
  'NOT VALID: optional future enforcement that price_snapshot is set. Run ALTER TABLE ... VALIDATE CONSTRAINT when ready.';
