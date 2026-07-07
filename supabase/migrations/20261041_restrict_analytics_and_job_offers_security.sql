-- Restrict analytics materialized views and the job_offers compatibility view.
-- MVs cannot use RLS; revoke API roles and keep service_role access only.
-- job_offers is recreated with security_invoker so dispatch_offers RLS applies.

-- ---------------------------------------------------------------------------
-- Analytics materialized views (service_role / cron only)
-- ---------------------------------------------------------------------------
revoke all on public.mv_booking_funnel_daily from public, anon, authenticated;
revoke all on public.mv_payment_conversion_daily from public, anon, authenticated;

grant select on public.mv_booking_funnel_daily to service_role;
grant select on public.mv_payment_conversion_daily to service_role;

comment on materialized view public.mv_booking_funnel_daily is
  'Admin analytics MV; service_role only. Refresh via refresh_analytics_materialized_views().';
comment on materialized view public.mv_payment_conversion_daily is
  'Admin analytics MV; service_role only. Refresh via refresh_analytics_materialized_views().';

-- ---------------------------------------------------------------------------
-- Daily rollup tables (RLS enabled but no client policies — lock grants)
-- ---------------------------------------------------------------------------
revoke all on public.daily_booking_funnel_metrics from public, anon, authenticated;
revoke all on public.daily_conversion_metrics from public, anon, authenticated;
revoke all on public.daily_payment_metrics from public, anon, authenticated;
revoke all on public.daily_service_metrics from public, anon, authenticated;

grant select, insert, update, delete on public.daily_booking_funnel_metrics to service_role;
grant select, insert, update, delete on public.daily_conversion_metrics to service_role;
grant select, insert, update, delete on public.daily_payment_metrics to service_role;
grant select, insert, update, delete on public.daily_service_metrics to service_role;

grant select on public.daily_booking_funnel_metrics to authenticated;
grant select on public.daily_conversion_metrics to authenticated;
grant select on public.daily_payment_metrics to authenticated;
grant select on public.daily_service_metrics to authenticated;

drop policy if exists daily_booking_funnel_metrics_admin_select on public.daily_booking_funnel_metrics;
create policy daily_booking_funnel_metrics_admin_select on public.daily_booking_funnel_metrics
  for select to authenticated
  using (public.blog_is_admin());

drop policy if exists daily_conversion_metrics_admin_select on public.daily_conversion_metrics;
create policy daily_conversion_metrics_admin_select on public.daily_conversion_metrics
  for select to authenticated
  using (public.blog_is_admin());

drop policy if exists daily_payment_metrics_admin_select on public.daily_payment_metrics;
create policy daily_payment_metrics_admin_select on public.daily_payment_metrics
  for select to authenticated
  using (public.blog_is_admin());

drop policy if exists daily_service_metrics_admin_select on public.daily_service_metrics;
create policy daily_service_metrics_admin_select on public.daily_service_metrics
  for select to authenticated
  using (public.blog_is_admin());

-- ---------------------------------------------------------------------------
-- job_offers view: enforce dispatch_offers RLS via security_invoker
-- ---------------------------------------------------------------------------
drop view if exists public.job_offers;

create view public.job_offers
with (security_invoker = true)
as
select
  id,
  booking_id,
  cleaner_id,
  case
    when status = 'rejected' then 'declined'
    else status
  end as status,
  expires_at,
  created_at
from public.dispatch_offers;

revoke all on public.job_offers from public, anon;
grant select on public.job_offers to authenticated, service_role;

comment on view public.job_offers is
  'Compatibility alias for dispatch_offers; security_invoker applies base-table RLS (cleaners see own offers only).';
