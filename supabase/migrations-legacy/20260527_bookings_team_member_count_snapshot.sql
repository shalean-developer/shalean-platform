-- Denormalized roster size captured at team assignment (think: team_member_count_at_assignment).
-- Intentionally not kept in sync if roster changes later — live counts fall back to team_members when null.
alter table public.bookings
  add column if not exists team_member_count_snapshot integer;

comment on column public.bookings.team_member_count_snapshot is
  'Active team roster count for the booking date at assignment time only; may drift if membership changes later.';
