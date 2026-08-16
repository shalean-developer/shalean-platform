-- CR-11D: return the complete distinct prior-customer set in one row so PostgREST row caps cannot truncate retention history.

create or replace function public.owner_prior_customer_ids(
  p_before timestamptz
)
returns table (
  customer_ids uuid[]
)
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(distinct b.customer_id order by b.customer_id), '{}'::uuid[])
  from public.bookings b
  where b.payment_status = 'success'
    and b.payment_completed_at is not null
    and b.customer_id is not null
    and b.payment_completed_at < p_before;
$$;

revoke all on function public.owner_prior_customer_ids(timestamptz) from public;
revoke all on function public.owner_prior_customer_ids(timestamptz) from anon;
revoke all on function public.owner_prior_customer_ids(timestamptz) from authenticated;
grant execute on function public.owner_prior_customer_ids(timestamptz) to service_role;
