begin;
-- One transaction owns the receipt event and customer counters. A retry cannot double-count.
create or replace function public.audit_03c02_record_payment_receipt(p_booking_id uuid,p_reference text,p_amount_cents bigint)
returns void language plpgsql security definer set search_path=pg_catalog as $$
declare b public.bookings; inserted_count integer;
begin
 select * into b from public.bookings where id=p_booking_id for update;
 if not found or (b.date is not null and b.date::date >= date '2026-10-01')
   or b.paystack_reference is distinct from p_reference or p_amount_cents is null or p_amount_cents<0
   or coalesce(b.total_paid_cents,b.amount_paid_cents,0)<>p_amount_cents
   or b.status::text in ('pending_payment','payment_expired','payment_mismatch') then
   raise exception 'historical_payment_receipt_mismatch' using errcode='23514';
 end if;
 insert into public.user_events(user_id,event_type,booking_id,payload)
 values(b.customer_id,'booking_created',b.id,jsonb_build_object('paystack_reference',p_reference,'amount_cents',p_amount_cents,'customer_email',b.customer_email))
 on conflict do nothing;
 get diagnostics inserted_count=row_count;
 if inserted_count=1 and b.customer_id is not null then
   insert into public.user_profiles(id,booking_count,total_spent_cents,updated_at)
   values(b.customer_id,1,p_amount_cents,now())
   on conflict(id) do update set booking_count=coalesce(user_profiles.booking_count,0)+1,
     total_spent_cents=coalesce(user_profiles.total_spent_cents,0)+excluded.total_spent_cents,updated_at=now();
 end if;
end; $$;
revoke all on function public.audit_03c02_record_payment_receipt(uuid,text,bigint) from public,anon,authenticated;
grant execute on function public.audit_03c02_record_payment_receipt(uuid,text,bigint) to service_role;
commit;
