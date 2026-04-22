-- Run in Supabase SQL Editor after migrations (see booking_stack_apply_order.sql).
-- Expect: every row shows exists = true (or args_match = true for the function check).

select 'bookings' as name, to_regclass('public.bookings') is not null as exists;
select 'failed_jobs' as name, to_regclass('public.failed_jobs') is not null as exists;
select 'system_logs' as name, to_regclass('public.system_logs') is not null as exists;
select 'user_profiles' as name, to_regclass('public.user_profiles') is not null as exists;
select 'user_events' as name, to_regclass('public.user_events') is not null as exists;
select 'booking_lifecycle_jobs' as name, to_regclass('public.booking_lifecycle_jobs') is not null as exists;
select 'locations' as name, to_regclass('public.locations') is not null as exists;

select 'increment_user_profile_stats (exists)' as name,
  exists(
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'increment_user_profile_stats'
  ) as exists;

-- App expects named args p_user_id, p_amount (after 20260421_fix_user_profile_function.sql)
select 'increment_user_profile_stats (args)' as name,
  coalesce(
    (
      select
        pg_get_function_arguments(p.oid) ilike '%p_user_id uuid%'
        and pg_get_function_arguments(p.oid) ilike '%p_amount bigint%'
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname = 'increment_user_profile_stats'
      limit 1
    ),
    false
  ) as args_match;
