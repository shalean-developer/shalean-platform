-- Atomic mark-paid for invoice-eligible bookings: row lock + single run id (avoids concurrent admin races).
create or replace function public.admin_mark_payout_paid(p_cleaner_ids uuid[])
returns table(updated_count bigint, payout_run_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run_id uuid := gen_random_uuid();
  v_count bigint := 0;
begin
  with locked as (
    select b.id
    from public.bookings b
    where b.payout_status = 'eligible'
      and b.cleaner_id = any(p_cleaner_ids)
    for update
  ),
  updated as (
    update public.bookings b
    set
      payout_status = 'paid',
      payout_paid_at = now(),
      payout_run_id = v_run_id
    from locked l
    where b.id = l.id
    returning b.id
  )
  select count(*)::bigint into v_count from updated;

  return query select v_count, v_run_id;
end;
$$;

comment on function public.admin_mark_payout_paid(uuid[]) is
  'Marks eligible bookings paid for given cleaner ids under row locks; returns count and shared payout_run_id (service_role only).';

revoke all on function public.admin_mark_payout_paid(uuid[]) from public;
grant execute on function public.admin_mark_payout_paid(uuid[]) to service_role;
