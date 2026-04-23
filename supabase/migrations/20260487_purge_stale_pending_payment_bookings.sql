-- Abandoned Paystack checkouts: remove stale pending_payment rows (no webhook / verify).

create or replace function public.purge_stale_pending_payment_bookings()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted bigint;
begin
  delete from public.bookings
  where status = 'pending_payment'
    and created_at < now() - interval '2 hours';

  get diagnostics v_deleted = row_count;

  insert into public.dispatch_logs (source, level, message, context)
  values (
    'purge_stale_pending_payment_bookings',
    'info',
    'purged stale pending_payment bookings',
    jsonb_build_object('deleted', v_deleted)
  );

  return jsonb_build_object(
    'ok', true,
    'deleted', v_deleted,
    'ran_at', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
  );
exception
  when others then
    insert into public.dispatch_logs (source, level, message, context)
    values (
      'purge_stale_pending_payment_bookings',
      'error',
      sqlerrm,
      jsonb_build_object('sqlstate', sqlstate)
    );
    return jsonb_build_object('ok', false, 'error', sqlerrm, 'sqlstate', sqlstate);
end;
$$;

comment on function public.purge_stale_pending_payment_bookings() is
  'Deletes bookings stuck in pending_payment older than 2h (abandoned checkout). Run hourly via pg_cron.';

revoke all on function public.purge_stale_pending_payment_bookings() from public;
grant execute on function public.purge_stale_pending_payment_bookings() to service_role;

-- Unschedule on re-apply
do $$
declare
  r record;
begin
  for r in
    select jobid, jobname
    from cron.job
    where jobname = 'purge-pending-payment-bookings'
  loop
    perform cron.unschedule(r.jobid);
  end loop;
end
$$;

-- Hourly
select cron.schedule(
  'purge-pending-payment-bookings',
  '0 * * * *',
  $$select public.purge_stale_pending_payment_bookings();$$
);
