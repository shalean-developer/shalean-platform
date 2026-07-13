-- Speed up purge of stale pending_payment rows at scale (partial index on created_at).
create index if not exists idx_bookings_pending_payment_created
  on public.bookings (created_at)
  where status = 'pending_payment';

comment on index public.idx_bookings_pending_payment_created is
  'Supports purge_stale_pending_payment_bookings() time-range delete.';

-- Postgres logs: quick visibility when cron runs (no log_statement change required).
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

  raise log 'purge_stale_pending_payment_bookings: purged % pending_payment rows',
    v_deleted;

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
