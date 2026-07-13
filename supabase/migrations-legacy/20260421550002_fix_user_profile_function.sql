-- Fix increment_user_profile_stats: parameter name p_amount (matches app RPC args).
-- Note: user_profiles PK is `id` (references auth.users), not `user_id`.
--
-- Postgres rejects CREATE OR REPLACE when only parameter *names* change (42P13).
-- Drop first, then create.

drop function if exists public.increment_user_profile_stats(uuid, bigint);

create function public.increment_user_profile_stats(
  p_user_id uuid,
  p_amount bigint
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_profiles (id, booking_count, total_spent_cents, updated_at)
  values (p_user_id, 1, p_amount, now())
  on conflict (id) do update set
    booking_count = user_profiles.booking_count + 1,
    total_spent_cents = user_profiles.total_spent_cents + excluded.total_spent_cents,
    updated_at = now();
end;
$$;

grant execute on function public.increment_user_profile_stats(uuid, bigint) to service_role;
