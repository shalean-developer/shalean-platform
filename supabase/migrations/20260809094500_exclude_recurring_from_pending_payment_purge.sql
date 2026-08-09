-- P5 recurring reliability: system-generated recurring occurrences are not abandoned
-- customer checkout rows. Purging them after two hours causes the recurring generator
-- to recreate the same plan/date and re-send payment recovery messages repeatedly.

create or replace function public.purge_stale_pending_payment_bookings()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted bigint;
  v_recurring_protected bigint;
begin
  select count(*)
    into v_recurring_protected
  from public.bookings
  where status = 'pending_payment'
    and created_at < now() - interval '2 hours'
    and coalesce(is_recurring_generated, false) = true;

  delete from public.bookings
  where status = 'pending_payment'
    and created_at < now() - interval '2 hours'
    and coalesce(is_recurring_generated, false) = false;

  get diagnostics v_deleted = row_count;

  raise log 'purge_stale_pending_payment_bookings: purged % checkout rows, protected % recurring rows',
    v_deleted, v_recurring_protected;

  insert into public.dispatch_logs (source, level, message, context)
  values (
    'purge_stale_pending_payment_bookings',
    'info',
    'purged stale pending_payment checkout bookings',
    jsonb_build_object(
      'deleted', v_deleted,
      'recurring_protected', v_recurring_protected
    )
  );

  return jsonb_build_object(
    'ok', true,
    'deleted', v_deleted,
    'recurring_protected', v_recurring_protected,
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
  'Deletes stale user checkout pending_payment bookings while preserving system-generated recurring occurrences so plan/date idempotency remains durable.';

revoke all on function public.purge_stale_pending_payment_bookings() from public;
grant execute on function public.purge_stale_pending_payment_bookings() to service_role;
