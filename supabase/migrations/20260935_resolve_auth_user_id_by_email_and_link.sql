-- ============================================================================
-- Reapply: auth user lookup helpers for admin customer/booking flows
-- ----------------------------------------------------------------------------
-- Purpose
--   Idempotently re-creates the `public.resolve_auth_user_id_by_email(text)`
--   RPC and the `auto_link_booking_user` BEFORE INSERT trigger that map a
--   normalised customer email to `auth.users.id`. The original migration
--   (`20260424_booking_auto_link_users.sql`) was authored long ago, but the
--   active database (`tchayecuvzssixyxlvfu`) is missing both objects:
--
--     ERROR  42883: function public.resolve_auth_user_id_by_email(unknown)
--            does not exist
--     -- and SELECT * FROM pg_proc WHERE proname='link_booking_to_user' is empty.
--
-- Symptoms before this migration
--   * Admin booking customer search at /api/admin/bookings/customers?q=<email>
--     returned "No matches." for emails that exist in `auth.users` because
--     `findAuthUserIdByEmail` (lib/cleaner/linkCleanerAuth.ts) fell through
--     RPC → bookings(user_id NOT NULL) → listUsers, and the booking row had
--     `user_id IS NULL` (no trigger to set it), and the listUsers paginated
--     fallback was unreliable.
--   * `admin.auth.admin.createUser` then surfaced "A user with this email
--     address has already been registered" in /api/admin/customers because
--     the pre-check returned null but auth still rejected the duplicate.
--   * `bookings.user_id` was NULL for inserts that omitted it, even when
--     `customer_email` matched a real `auth.users` row.
--
-- Scope
--   Idempotent re-create of the RPC, idempotent re-create of the trigger,
--   and a one-shot backfill that links existing orphan bookings. No app
--   code change here. Safe to re-run.
-- ============================================================================

create or replace function public.resolve_auth_user_id_by_email(p_email text)
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select u.id
  from auth.users u
  where lower(trim(u.email::text)) = lower(trim(coalesce(p_email, '')))
  limit 1;
$$;

revoke all on function public.resolve_auth_user_id_by_email(text) from public;
grant execute on function public.resolve_auth_user_id_by_email(text) to service_role;

comment on function public.resolve_auth_user_id_by_email(text) is
  'Maps a normalised customer email to auth.users.id. Used by admin customer/booking lookup, Paystack upsert RPC, and link_booking_to_user.';

create or replace function public.link_booking_to_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.user_id is null
     and new.customer_email is not null
     and length(trim(new.customer_email)) > 0 then
    new.user_id := public.resolve_auth_user_id_by_email(new.customer_email);
  end if;
  return new;
end;
$$;

drop trigger if exists auto_link_booking_user on public.bookings;

create trigger auto_link_booking_user
  before insert on public.bookings
  for each row
  execute function public.link_booking_to_user();

comment on function public.link_booking_to_user() is
  'Safety net: sets bookings.user_id from auth.users when insert omits user_id but customer_email matches.';

-- One-shot backfill: link any bookings where user_id is null but the email
-- now resolves to a real auth user. Safe to re-run; the WHERE clause excludes
-- already-linked rows.
update public.bookings b
set user_id = public.resolve_auth_user_id_by_email(b.customer_email)
where b.user_id is null
  and b.customer_email is not null
  and length(trim(b.customer_email)) > 0
  and public.resolve_auth_user_id_by_email(b.customer_email) is not null;
