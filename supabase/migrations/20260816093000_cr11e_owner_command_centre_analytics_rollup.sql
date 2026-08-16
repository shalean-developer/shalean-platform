-- CR-11E: collapse Owner Command Centre analytics into one bounded rollup row.

create or replace function public.owner_command_centre_analytics_rollup(
  p_start timestamptz,
  p_end timestamptz
)
returns table (
  total_bookings bigint,
  total_revenue_zar bigint,
  distinct_customers bigint,
  returning_customers bigint,
  service_pairs jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  with eligible as (
    select
      b.customer_id,
      b.service,
      b.service_slug,
      case
        when coalesce(b.amount_paid_cents, 0) > 0 then round(b.amount_paid_cents::numeric)
        else round(coalesce(b.total_paid_zar, 0)::numeric * 100)
      end as paid_cents
    from public.bookings b
    where b.payment_status = 'success'
      and b.payment_completed_at is not null
      and b.payment_completed_at >= p_start
      and b.payment_completed_at < p_end
      and lower(coalesce(b.status, '')) not in ('cancelled', 'failed', 'payment_expired')
      and b.refunded_at is null
      and lower(coalesce(b.refund_status, '')) not in ('refunded', 'full', 'partial', 'chargeback', 'reversed', 'failed_after_success')
      and b.monthly_invoice_id is null
      and coalesce(b.is_monthly_billing_booking, false) = false
      and lower(coalesce(b.billing_type, '')) not in ('recurring_invoice', 'monthly_contract')
      and (coalesce(b.amount_paid_cents, 0) > 0 or coalesce(b.total_paid_zar, 0) > 0)
  ),
  current_customers as (
    select distinct e.customer_id
    from eligible e
    where e.customer_id is not null
  ),
  prior_customers as (
    select distinct b.customer_id
    from public.bookings b
    where b.payment_status = 'success'
      and b.payment_completed_at is not null
      and b.customer_id is not null
      and b.payment_completed_at < p_start
  ),
  services as (
    select e.service, e.service_slug, count(*)::bigint as count
    from eligible e
    group by e.service, e.service_slug
  ),
  service_json as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'service', s.service,
          'service_slug', s.service_slug,
          'count', s.count
        )
        order by s.count desc, coalesce(s.service_slug, ''), coalesce(s.service, '')
      ),
      '[]'::jsonb
    ) as value
    from services s
  )
  select
    (select count(*)::bigint from eligible),
    (select coalesce(sum(round(e.paid_cents / 100.0)), 0)::bigint from eligible e),
    (select count(*)::bigint from current_customers),
    (
      select count(*)::bigint
      from current_customers c
      join prior_customers p using (customer_id)
    ),
    sj.value
  from service_json sj;
$$;

revoke all on function public.owner_command_centre_analytics_rollup(timestamptz, timestamptz) from public;
revoke all on function public.owner_command_centre_analytics_rollup(timestamptz, timestamptz) from anon;
revoke all on function public.owner_command_centre_analytics_rollup(timestamptz, timestamptz) from authenticated;
grant execute on function public.owner_command_centre_analytics_rollup(timestamptz, timestamptz) to service_role;
