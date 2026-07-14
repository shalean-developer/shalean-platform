-- Bulletproof booking ↔ user linking: RPC for server code, trigger as safety net.
-- auth.users is not exposed via PostgREST; use SECURITY DEFINER helper for email → id.

-- 1) Resolve auth user id by normalized email (service_role / trigger only — not public anon)
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
  'Maps normalized customer email to auth.users.id. Used by Paystack upsert RPC and booking link trigger.';

-- 2) BEFORE INSERT: if user_id is still null, link by customer_email (same as app logic)
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

-- 3) Backfill any rows still orphaned (e.g. users created after booking)
update public.bookings b
set user_id = public.resolve_auth_user_id_by_email(b.customer_email)
where b.user_id is null
  and b.customer_email is not null
  and length(trim(b.customer_email)) > 0;
