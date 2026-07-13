-- VIP tiers on user_profiles, tier recalc, completion trigger, rebook_reminder job type

-- ---------------------------------------------------------------------------
-- 1) Tier column (booking_count + total_spent_cents already exist)
-- ---------------------------------------------------------------------------
alter table public.user_profiles
  add column if not exists tier text not null default 'regular';

alter table public.user_profiles
  drop constraint if exists user_profiles_tier_check;

alter table public.user_profiles
  add constraint user_profiles_tier_check
  check (tier in ('regular', 'silver', 'gold', 'platinum'));

comment on column public.user_profiles.tier is
  'Loyalty band: regular | silver | gold | platinum — from booking_count and total_spent_cents.';

-- ---------------------------------------------------------------------------
-- 2) Derive tier from stats (amounts in cents: R1000=100000, R3000=300000, R8000=800000)
-- ---------------------------------------------------------------------------
create or replace function public.recalculate_user_tier(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.user_profiles
  set
    tier = case
      when booking_count >= 10 or total_spent_cents >= 800000 then 'platinum'
      when booking_count >= 5 or total_spent_cents >= 300000 then 'gold'
      when booking_count >= 2 or total_spent_cents >= 100000 then 'silver'
      else 'regular'
    end,
    updated_at = now()
  where id = p_user_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3) increment_user_profile_stats — append tier recalc (drop/recreate for body change)
-- ---------------------------------------------------------------------------
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

  perform public.recalculate_user_tier(p_user_id);
end;
$$;

grant execute on function public.increment_user_profile_stats(uuid, bigint) to service_role;

-- Backfill tiers for existing profiles
update public.user_profiles
set tier = case
  when booking_count >= 10 or total_spent_cents >= 800000 then 'platinum'
  when booking_count >= 5 or total_spent_cents >= 300000 then 'gold'
  when booking_count >= 2 or total_spent_cents >= 100000 then 'silver'
  else 'regular'
end;

-- ---------------------------------------------------------------------------
-- 4) Refresh tier when a booking is marked completed (edge-case safety)
-- ---------------------------------------------------------------------------
create or replace function public.trg_bookings_completed_refresh_tier()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'completed'
     and (old.status is distinct from 'completed')
     and new.user_id is not null then
    perform public.recalculate_user_tier(new.user_id);
  end if;
  return new;
end;
$$;

drop trigger if exists update_user_tier_trigger on public.bookings;

create trigger update_user_tier_trigger
  after update of status on public.bookings
  for each row
  when (new.status = 'completed' and (old.status is distinct from 'completed'))
  execute function public.trg_bookings_completed_refresh_tier();

-- ---------------------------------------------------------------------------
-- 5) Lifecycle: allow rebook_reminder (14-day retention nudge after completion)
-- ---------------------------------------------------------------------------
alter table public.booking_lifecycle_jobs drop constraint if exists booking_lifecycle_jobs_job_type_check;

alter table public.booking_lifecycle_jobs
  add constraint booking_lifecycle_jobs_job_type_check
  check (
    job_type in (
      'reminder_24h',
      'review_request',
      'rebook_offer',
      'rebook_reminder'
    )
  );
