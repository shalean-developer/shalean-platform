-- Quote→invoice bookings stay in pending_payment until the sales document is paid.
-- Do not treat them as abandoned Paystack checkouts.

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
    and created_at < now() - interval '2 hours'
    and sales_document_id is null;

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

comment on function public.purge_stale_pending_payment_bookings() is
  'Deletes abandoned Paystack checkout rows (pending_payment > 2h). Skips sales-document-linked bookings awaiting invoice payment.';
