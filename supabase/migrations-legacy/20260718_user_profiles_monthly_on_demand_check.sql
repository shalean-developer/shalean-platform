-- Enforce: monthly billing always uses on-demand schedule (matches API + admin UI).

update public.user_profiles
set schedule_type = 'on_demand'
where billing_type = 'monthly'
  and schedule_type is distinct from 'on_demand';

alter table public.user_profiles
  drop constraint if exists user_profiles_monthly_requires_on_demand;

alter table public.user_profiles
  add constraint user_profiles_monthly_requires_on_demand
  check (billing_type <> 'monthly' or schedule_type = 'on_demand');

comment on constraint user_profiles_monthly_requires_on_demand on public.user_profiles is
  'Monthly invoicing is only valid with on_demand schedule (no fixed-schedule auto-spawn drift).';
