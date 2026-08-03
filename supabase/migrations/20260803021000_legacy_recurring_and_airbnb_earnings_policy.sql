-- Preserve historical earnings for pre-cutover recurring plans and the three
-- Airbnb customers priced under the July 2026 model. New plans/customers use
-- the current 60% policy implemented by the application.

alter table public.recurring_bookings
  add column if not exists earnings_policy text not null default 'current_v1',
  add column if not exists legacy_earnings_cents integer,
  add column if not exists earnings_policy_locked_at timestamptz;

alter table public.recurring_bookings
  drop constraint if exists recurring_bookings_earnings_policy_check;
alter table public.recurring_bookings
  add constraint recurring_bookings_earnings_policy_check
  check (earnings_policy in ('legacy_july', 'current_v1'));

alter table public.bookings
  add column if not exists earnings_policy text not null default 'current_v1',
  add column if not exists earnings_policy_locked_at timestamptz;

alter table public.bookings
  drop constraint if exists bookings_earnings_policy_check;
alter table public.bookings
  add constraint bookings_earnings_policy_check
  check (earnings_policy in ('legacy_july', 'current_v1'));

create table if not exists public.customer_earnings_policies (
  customer_id uuid primary key references auth.users(id) on delete cascade,
  earnings_policy text not null,
  legacy_earnings_cents integer,
  applies_to_services text[] not null default array['airbnb']::text[],
  reason text,
  locked_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customer_earnings_policies_policy_check
    check (earnings_policy in ('legacy_july', 'current_v1')),
  constraint customer_earnings_policies_legacy_amount_check
    check (legacy_earnings_cents is null or legacy_earnings_cents > 0)
);

alter table public.customer_earnings_policies enable row level security;
revoke all on public.customer_earnings_policies from anon, authenticated;
grant all on public.customer_earnings_policies to service_role;

-- Lock every recurring plan that existed before the policy cutover. Determine
-- its historical fixed amount from the most common positive approved/stored
-- amount on that plan, preferring July 2026 and then its full booking history.
with plan_rates as (
  select
    rb.id,
    coalesce(
      mode() within group (
        order by coalesce(nullif(b.display_earnings_cents, 0), nullif(b.payout_frozen_cents, 0), nullif(b.cleaner_payout_cents, 0))
      ) filter (
        where b.date between '2026-07-01' and '2026-07-31'
          and coalesce(nullif(b.display_earnings_cents, 0), nullif(b.payout_frozen_cents, 0), nullif(b.cleaner_payout_cents, 0)) is not null
      ),
      mode() within group (
        order by coalesce(nullif(b.display_earnings_cents, 0), nullif(b.payout_frozen_cents, 0), nullif(b.cleaner_payout_cents, 0))
      ) filter (
        where coalesce(nullif(b.display_earnings_cents, 0), nullif(b.payout_frozen_cents, 0), nullif(b.cleaner_payout_cents, 0)) is not null
      )
    )::integer as legacy_cents
  from public.recurring_bookings rb
  left join public.bookings b
    on b.recurring_id = rb.id
   and b.status = 'completed'
   and coalesce(b.is_test, false) = false
  where rb.created_at < '2026-08-03T00:00:00+02:00'::timestamptz
  group by rb.id
)
update public.recurring_bookings rb
set earnings_policy = 'legacy_july',
    legacy_earnings_cents = pr.legacy_cents,
    earnings_policy_locked_at = now(),
    updated_at = now()
from plan_rates pr
where rb.id = pr.id;

-- The three July Airbnb customers remain at R250 under their old pricing.
insert into public.customer_earnings_policies (
  customer_id,
  earnings_policy,
  legacy_earnings_cents,
  applies_to_services,
  reason
)
select
  u.id,
  'legacy_july',
  25000,
  array['airbnb']::text[],
  'Existing Airbnb customer priced under the July 2026 earnings model'
from auth.users u
where lower(u.email) in (
  'karina.bahryi@yahoo.com',
  'fathimadoc@hotmail.com',
  'anicagrob@gmail.com'
)
on conflict (customer_id) do update
set earnings_policy = excluded.earnings_policy,
    legacy_earnings_cents = excluded.legacy_earnings_cents,
    applies_to_services = excluded.applies_to_services,
    reason = excluded.reason,
    locked_at = now(),
    updated_at = now();

create or replace function public.apply_booking_earnings_policy_lock()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_policy text := 'current_v1';
  v_legacy_cents integer;
  v_service text;
begin
  v_service := lower(coalesce(new.service_slug, new.service, ''));

  if new.recurring_id is not null then
    select rb.earnings_policy, rb.legacy_earnings_cents
      into v_policy, v_legacy_cents
    from public.recurring_bookings rb
    where rb.id = new.recurring_id;
  end if;

  if coalesce(v_policy, 'current_v1') = 'current_v1' and new.customer_id is not null then
    select cep.earnings_policy, cep.legacy_earnings_cents
      into v_policy, v_legacy_cents
    from public.customer_earnings_policies cep
    where cep.customer_id = new.customer_id
      and v_service = any(cep.applies_to_services);
  end if;

  new.earnings_policy := coalesce(v_policy, 'current_v1');

  -- Deep and move jobs retain role-based fixed earnings (R250 member / R270
  -- supervisor) and must continue through the team allocation logic.
  if new.earnings_policy = 'legacy_july'
     and v_service in ('standard', 'regular-cleaning', 'airbnb')
     and coalesce(v_legacy_cents, 0) > 0 then
    new.display_earnings_cents := v_legacy_cents;
    new.cleaner_payout_cents := v_legacy_cents;
    new.payout_earnings_cents := v_legacy_cents;
    new.internal_earnings_cents := v_legacy_cents;
    if new.payout_status = 'eligible' then
      new.payout_frozen_cents := v_legacy_cents;
    end if;
    new.earnings_model_version := 'legacy_july_locked_v1';
    new.earnings_percentage_applied := null;
    new.earnings_cap_cents_applied := v_legacy_cents;
    new.earnings_tenure_months_at_assignment := null;
    new.earnings_policy_locked_at := coalesce(new.earnings_policy_locked_at, now());
  end if;

  return new;
end;
$$;

revoke all on function public.apply_booking_earnings_policy_lock() from public;
grant execute on function public.apply_booking_earnings_policy_lock() to service_role;

drop trigger if exists bookings_apply_earnings_policy_lock on public.bookings;
create trigger bookings_apply_earnings_policy_lock
before insert or update of recurring_id, customer_id, service, service_slug,
  display_earnings_cents, cleaner_payout_cents, payout_earnings_cents,
  internal_earnings_cents, payout_frozen_cents, payout_status
on public.bookings
for each row execute function public.apply_booking_earnings_policy_lock();

-- Tag and lock already-generated future/open occurrences without altering
-- historical completed July records.
update public.bookings b
set earnings_policy = rb.earnings_policy,
    display_earnings_cents = case
      when lower(coalesce(b.service_slug, b.service, '')) in ('standard', 'regular-cleaning', 'airbnb')
       and rb.legacy_earnings_cents is not null then rb.legacy_earnings_cents
      else b.display_earnings_cents end,
    cleaner_payout_cents = case
      when lower(coalesce(b.service_slug, b.service, '')) in ('standard', 'regular-cleaning', 'airbnb')
       and rb.legacy_earnings_cents is not null then rb.legacy_earnings_cents
      else b.cleaner_payout_cents end,
    payout_earnings_cents = case
      when lower(coalesce(b.service_slug, b.service, '')) in ('standard', 'regular-cleaning', 'airbnb')
       and rb.legacy_earnings_cents is not null then rb.legacy_earnings_cents
      else b.payout_earnings_cents end,
    internal_earnings_cents = case
      when lower(coalesce(b.service_slug, b.service, '')) in ('standard', 'regular-cleaning', 'airbnb')
       and rb.legacy_earnings_cents is not null then rb.legacy_earnings_cents
      else b.internal_earnings_cents end,
    earnings_model_version = case
      when lower(coalesce(b.service_slug, b.service, '')) in ('standard', 'regular-cleaning', 'airbnb')
       and rb.legacy_earnings_cents is not null then 'legacy_july_locked_v1'
      else b.earnings_model_version end,
    earnings_policy_locked_at = coalesce(b.earnings_policy_locked_at, now())
from public.recurring_bookings rb
where b.recurring_id = rb.id
  and rb.earnings_policy = 'legacy_july'
  and b.date >= '2026-08-01'
  and lower(coalesce(b.payout_status, 'pending')) <> 'paid';

create index if not exists recurring_bookings_earnings_policy_idx
  on public.recurring_bookings (earnings_policy, status);
create index if not exists bookings_earnings_policy_idx
  on public.bookings (earnings_policy, date);

comment on column public.recurring_bookings.earnings_policy is
  'legacy_july preserves the historical fixed earning for existing plans; current_v1 uses the current percentage policy.';
comment on column public.recurring_bookings.legacy_earnings_cents is
  'Historical per-visit Standard/Airbnb earning copied from approved plan history. Deep/move use role-based fixed rates.';
comment on column public.bookings.earnings_policy is
  'The immutable earnings-policy family selected for this booking.';