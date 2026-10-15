begin;
select set_config('request.jwt.claim.role','service_role',true);
do $$
declare probe_type text; b public.bookings; invoice_id uuid; prior_basis jsonb; after_basis jsonb; prior_paid jsonb;
begin
 foreach probe_type in array array['recurring_invoice','monthly_contract','pay_later'] loop
 begin
 select * into b from public.bookings where status='pending_payment' and monthly_invoice_id is null and payout_id is null order by id limit 1;
 if not found then raise exception 'staging monthly-cash fixture unavailable'; end if;
 insert into public.monthly_invoices(customer_id,month,due_date,total_bookings,total_amount_cents,status)
 values(coalesce(b.customer_id,(select id from auth.users order by id limit 1)),'2026-09',date '2026-10-01',1,1000,'sent') returning id into invoice_id;
 set constraints all immediate;
 alter table public.bookings disable trigger audit_03c02_booking_boundary;
 alter table public.bookings disable trigger audit_03c02_final_booking_financials;
 update public.bookings set status=case when b.cleaner_id is not null or b.selected_cleaner_id is not null then 'pending_assignment' else 'pending' end,date='2026-09-30',billing_type=probe_type,monthly_invoice_id=invoice_id,
   payment_status='pending_monthly',amount_paid_cents=0,total_paid_zar=10,total_paid_cents=1000,payout_frozen_cents=77 where id=b.id;
 alter table public.bookings enable trigger audit_03c02_booking_boundary;
 alter table public.bookings enable trigger audit_03c02_final_booking_financials;
 if not exists(select 1 from public.bookings where id=b.id and billing_type=probe_type) then raise exception 'FAIL governed billing fixture was rewritten'; end if;
 select to_jsonb(x)-array['payment_status','amount_paid_cents','payment_completed_at','updated_at','payment_state'] into prior_basis from public.bookings x where id=b.id;
 alter table public.bookings add constraint audit_reject_monthly_cash check(billing_type::text not in ('recurring_invoice','monthly_contract','pay_later') or amount_paid_cents=0) not valid;
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
 begin
   update public.monthly_invoices set status='refunded',amount_paid_cents=0,refund_reference='audit-refund',refunded_at=now() where id=invoice_id;
   raise exception 'FAIL unverified monthly refund accepted';
 exception when check_violation then if sqlerrm<>'historical_monthly_reversal_unverified' then raise; end if; end;
 begin
   insert into public.refund_accounting_records(entity_type,entity_id,provider,refund_reference,refund_key,amount_cents,currency_code,refund_status)
   values('monthly_invoice',invoice_id,'manual','audit-refund','audit-'||invoice_id::text,1000,'ZAR','succeeded');
   alter table public.bookings add constraint audit_reject_monthly_reversal check(billing_type::text not in ('recurring_invoice','monthly_contract','pay_later') or amount_paid_cents>0) not valid;
   begin
     update public.monthly_invoices set status='refunded',amount_paid_cents=0,refund_reference='audit-refund',refunded_at=now() where id=invoice_id;
     raise exception 'FAIL reversal invoice committed despite child failure';
   exception when check_violation then if sqlerrm not like '%audit_reject_monthly_reversal%' then raise; end if; end;
   alter table public.bookings drop constraint audit_reject_monthly_reversal;
   if not exists(select 1 from public.monthly_invoices where id=invoice_id and status='paid' and amount_paid_cents=1000) then raise exception 'FAIL reversal partially committed'; end if;
   update public.monthly_invoices set status='refunded',amount_paid_cents=0,refund_reference='audit-refund',refunded_at=now() where id=invoice_id;
   if not exists(select 1 from public.bookings where id=b.id and payment_status='pending_monthly' and amount_paid_cents=0 and payout_status='pending' and payout_frozen_cents=77) then raise exception 'FAIL verified historical refund not applied'; end if;
   raise exception 'audit_refund_case_rollback' using errcode='Z0010';
 exception when sqlstate 'Z0010' then null; end;
 begin
   update public.monthly_invoices set status='draft',amount_paid_cents=0,is_closed=false where id=invoice_id;
   raise exception 'FAIL unverified manual revert accepted';
 exception when check_violation then if sqlerrm<>'historical_monthly_reversal_unverified' then raise; end if; end;
 insert into public.monthly_invoice_events(invoice_id,kind,payload) values(invoice_id,'admin_mark_paid',jsonb_build_object('amount_recorded_cents',1000,'amount_paid_cents_after',1000));
 update public.monthly_invoices set status='draft',amount_paid_cents=0,is_closed=false,snapshot_at_finalize=null where id=invoice_id;
 if not exists(select 1 from public.bookings where id=b.id and payment_status='pending_monthly' and amount_paid_cents=0 and payout_status='pending' and payout_frozen_cents=77 and payment_completed_at is null) then raise exception 'FAIL verified manual reversal not applied'; end if;
 raise exception 'audit_billing_case_rollback' using errcode='Z0200';
 exception when sqlstate 'Z0200' then null; end;
 end loop;
end $$;
rollback;
select 'PASS: all governed invoice billing types support atomic historical settlement and verified refund/manual reversals; unverified reversals rejected; frozen basis preserved; replay idempotent; all probes rolled back' evidence;
