-- Notification-only outbox identity. No booking, payment or ledger records are changed.
create unique index if not exists failed_jobs_payment_confirmation_notification_key
  on public.failed_jobs ((payload ->> 'bookingId'), (payload ->> 'paymentReference'))
  where type = 'payment_confirmation_notification';

create or replace function public.enqueue_payment_confirmation_notification(p_payload jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_booking_id uuid;
  v_reference text;
  v_payload jsonb;
  v_job_id uuid;
begin
  if pg_catalog.jsonb_typeof(p_payload) is distinct from 'object' then
    raise exception 'Confirmation retry payload must be an object' using errcode = '22023';
  end if;
  v_booking_id := (p_payload ->> 'bookingId')::uuid;
  v_reference := pg_catalog.btrim(p_payload ->> 'paymentReference');
  if v_booking_id is null or v_reference is null or pg_catalog.length(v_reference) not between 1 and 256 then
    raise exception 'Confirmation retry requires booking and payment reference' using errcode = '22023';
  end if;
  v_payload := p_payload || pg_catalog.jsonb_build_object('bookingId', v_booking_id::text, 'paymentReference', v_reference);

  insert into public.failed_jobs as jobs (type, payload)
  values ('payment_confirmation_notification', v_payload)
  on conflict ((payload ->> 'bookingId'), (payload ->> 'paymentReference'))
    where type = 'payment_confirmation_notification'
  -- Keep attempts, original event data and scheduled backoff when a callback repeats.
  do update set payload = jobs.payload
  returning jobs.id into v_job_id;
  return v_job_id;
end;
$function$;

revoke all on function public.enqueue_payment_confirmation_notification(jsonb) from public, anon, authenticated;
grant execute on function public.enqueue_payment_confirmation_notification(jsonb) to service_role;
