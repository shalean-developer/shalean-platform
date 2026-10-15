begin;
select set_config('request.jwt.claim.role','service_role',true);
do $$
declare b public.bookings; invoice_id uuid; prior_basis jsonb; after_basis jsonb; prior_paid jsonb;
begin
 select * into b from public.bookings where status='pending_payment' and monthly_invoice_id is null and payout_id is null order by id limit 1;
 if not found then raise exception 'staging monthly-cash fixture unavailable'; end if;
 insert into public.monthly_invoices(customer_id,month,due_date,total_bookings,total_amount_cents,status)
 values(coalesce(b.customer_id,(select id from auth.users order by id limit 1)),'2026-09',date '2026-10-01',1,1000,'sent') returning id into invoice_id;
 set constraints all immediate;
 alter table public.bookings disable trigger audit_03c02_booking_boundary;
 alter table public.bookings disable trigger audit_03c02_final_booking_financials;
 update public.bookings set status=case when b.cleaner_id is not null or b.selected_cleaner_id is not null then 'pending_assignment' else 'pending' end,date='2026-09-30',billing_type='monthly',monthly_invoice_id=invoice_id,
   payment_status='pending_monthly',amount_paid_cents=0,total_paid_zar=10,total_paid_cents=1000,payout_frozen_cents=77 where id=b.id;
 alter table public.bookings enable trigger audit_03c02_booking_boundary;
 alter table public.bookings enable trigger audit_03c02_final_booking_financials;
 select to_jsonb(x)-array['payment_status','amount_paid_cents','payment_completed_at','updated_at','payment_state'] into prior_basis from public.bookings x where id=b.id;
 alter table public.bookings add constraint audit_reject_monthly_cash check(billing_type::text not in ('monthly','recurring_invoice') or amount_paid_cents=0) not valid;
 begin
   update public.monthly_invoices set status='paid',amount_paid_cents=1000 where id=invoice_id;
   raise exception 'FAIL invoice paid despite child cash failure';
 exception when check_violation then if sqlerrm not like '%audit_reject_monthly_cash%' then raise; end if; end;
 alter table public.bookings drop constraint audit_reject_monthly_cash;
 if not exists(select 1 from public.monthly_invoices where id=invoice_id and status='sent' and amount_paid_cents=0)
   or not exists(select 1 from public.bookings where id=b.id and amount_paid_cents=0 and payment_status='pending_monthly') then raise exception 'FAIL monthly cash transaction partially committed'; end if;
 update public.monthly_invoices set status='paid',amount_paid_cents=1000 where id=invoice_id;
 if not exists(select 1 from public.bookings where id=b.id and amount_paid_cents=1000 and payment_status='success' and payout_frozen_cents=77) then raise exception 'FAIL monthly cash missing'; end if;
 select to_jsonb(x)-array['payment_status','amount_paid_cents','payment_completed_at','updated_at','payment_state'] into after_basis from public.bookings x where id=b.id;
 if prior_basis is distinct from after_basis then raise exception 'FAIL historical monthly earnings or eligibility changed'; end if;
 select to_jsonb(x) into prior_paid from public.bookings x where id=b.id;
 perform public.audit_03c02_settle_historical_monthly_child(invoice_id,b.id);
 if prior_paid is distinct from (select to_jsonb(x) from public.bookings x where id=b.id) then raise exception 'FAIL monthly replay changed paid child'; end if;
 begin
   update public.bookings set payout_frozen_cents=99 where id=b.id;
   raise exception 'FAIL historical monthly payout basis mutable';
 exception when check_violation then if sqlerrm<>'historical_payout_item_deferred' then raise; end if; end;
end $$;
rollback;
select 'PASS: historical monthly cash settles before invoice paid; child failure rolls back invoice; frozen basis and eligibility preserved; replay idempotent; all probes rolled back' evidence;
