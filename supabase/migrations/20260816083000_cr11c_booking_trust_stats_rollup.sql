-- CR-11C: aggregate public booking trust counters in Postgres instead of transferring booking rows.

create or replace function public.booking_trust_stats_rollup(
  p_today_since timestamptz,
  p_week_since timestamptz
)
returns table (
  bookings_today bigint,
  bookings_this_week bigint,
  completed_this_week bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    count(*) filter (
      where b.created_at >= p_today_since
        and (
          coalesce(b.total_paid_zar, 0) > 0
          or coalesce(b.amount_paid_cents, 0) > 0
          or lower(coalesce(b.status, '')) = 'paid'
          or lower(coalesce(b.payment_status, '')) in ('paid', 'success')
        )
    )::bigint as bookings_today,
    count(*) filter (
      where b.created_at >= p_week_since
        and (
          coalesce(b.total_paid_zar, 0) > 0
          or coalesce(b.amount_paid_cents, 0) > 0
          or lower(coalesce(b.status, '')) = 'paid'
          or lower(coalesce(b.payment_status, '')) in ('paid', 'success')
        )
    )::bigint as bookings_this_week,
    count(*) filter (
      where b.created_at >= p_week_since
        and lower(coalesce(b.status, '')) = 'completed'
    )::bigint as completed_this_week
  from public.bookings b
  where b.created_at >= least(p_today_since, p_week_since);
$$;

revoke all on function public.booking_trust_stats_rollup(timestamptz, timestamptz) from public;
revoke all on function public.booking_trust_stats_rollup(timestamptz, timestamptz) from anon;
revoke all on function public.booking_trust_stats_rollup(timestamptz, timestamptz) from authenticated;
grant execute on function public.booking_trust_stats_rollup(timestamptz, timestamptz) to service_role;
