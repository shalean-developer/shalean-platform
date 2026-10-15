-- Staging-only, transaction-contained verified payment convergence probes.
begin;
select set_config('request.jwt.claim.role','service_role',true);
do $$
declare probe_customer uuid; probe_email text; probe_plan uuid; before_capture jsonb; queue_count integer; receipt_count integer; prior_count bigint; prior_spent bigint; receipt_existed boolean; probe_date text; b public.bookings; intent jsonb; succeeded jsonb; expected jsonb; result jsonb; before_basis jsonb; after_basis jsonb;
 keys text[]:=array['date','cleaner_id','payout_owner_cleaner_id','team_id','base_amount_cents','service_fee_cents','price_snapshot','display_earnings_cents','internal_earnings_cents','payout_earnings_cents','cleaner_payout_cents','payout_frozen_cents'];
begin
 foreach probe_date in array array['2026-09-30',null,'2026-02-30','bad-date','2026-10-1'] loop
 begin
 select * into b from public.bookings where status='pending_payment' and payout_id is null
   and monthly_invoice_id is null and billing_type='prepaid' and nullif(paystack_reference,'') is not null order by id limit 1;
 if not found then raise exception 'staging pending-payment fixture unavailable'; end if;
 probe_customer:=coalesce(b.customer_id,(select id from auth.users order by id limit 1));
 probe_email:=coalesce(nullif(btrim(b.customer_email),''),'audit-identity@example.com');
 insert into public.recurring_bookings(customer_id,frequency,days_of_week,start_date,price,next_run_date)
 values(probe_customer,'weekly',array[1],date '2026-10-01',100,date '2026-10-19') returning id into probe_plan;
 update public.bookings set recurring_id=probe_plan,customer_id=null,customer_email=null where id=b.id;
 intent:=jsonb_build_object('version',1,'captured_cents',1000,'refunded_cents',0,'currency','ZAR','records',jsonb_build_array(
   jsonb_build_object('id','audit-refund','amount_cents',200,'currency','ZAR','record_only',false,'provider_state','submitted_to_provider')));
 update public.bookings set paystack_reference=case when probe_date is null then id::text else paystack_reference end,selected_cleaner_id=(select id from public.cleaners order by id limit 1),booking_snapshot=coalesce(booking_snapshot,'{}')||jsonb_build_object('refund_workflow',intent) where id=b.id;
 set constraints all immediate;
 alter table public.bookings disable trigger audit_03c02_final_booking_financials;
 update public.bookings set date=probe_date where id=b.id;
 set constraints all immediate;
 alter table public.bookings enable trigger audit_03c02_final_booking_financials;
 select jsonb_object_agg(key,value) into before_basis from public.bookings x,jsonb_each(to_jsonb(x)) where x.id=b.id and key=any(keys);
 select jsonb_object_agg(key,value) into expected from public.bookings x,jsonb_each(to_jsonb(x))
   where x.id=b.id and key=any(array['status','paystack_reference','customer_email','customer_id','cleaner_id','selected_cleaner_id','assignment_type']);
 if probe_date is null then
   begin
     perform public.audit_03c02_record_historical_capture(b.id,'audit-mismatch-'||b.id::text,123,'USD',now(),expected,'currency_mismatch',b.id);
     if not exists(select 1 from public.bookings where id=b.id and paystack_reference='audit-mismatch-'||b.id::text and status='payment_mismatch') then raise exception 'FAIL mismatch charge reference not retained'; end if;
     raise exception 'audit_alias_probe_rollback' using errcode='Z0002';
   exception when sqlstate 'Z0002' then null; end;
 end if;
 begin
   perform public.audit_03c02_record_historical_capture(b.id,'wrong-reference',1000,'ZAR',now(),expected);
   raise exception 'FAIL wrong charge reference';
 exception when check_violation then if sqlerrm<>'historical_capture_identity_mismatch' then raise; end if; end;
 alter table public.recurring_bookings add constraint audit_reject_auth check(paystack_authorization_code is null) not valid;
 begin
   perform public.audit_03c02_record_historical_capture(b.id,b.paystack_reference,1000,'ZAR',now(),expected,null,b.id,('{"authorizationCode":"AUTH_audit"}'::jsonb||jsonb_build_object('customerAuthId',probe_customer,'customerEmail',probe_email)));
   raise exception 'FAIL authorization failure accepted';
 exception when check_violation then if sqlerrm not like '%audit_reject_auth%' then raise; end if; end;
 alter table public.recurring_bookings drop constraint audit_reject_auth;
 if (select status from public.bookings where id=b.id)<>expected->>'status' then raise exception 'FAIL capture survived authorization failure'; end if;
 select to_jsonb(x) into before_capture from public.bookings x where id=b.id;
 select count(*) into queue_count from public.failed_jobs where type='historical_payment_effect' and payload->>'bookingId'=b.id::text;
 alter table public.failed_jobs add constraint audit_reject_effect_queue check(type<>'historical_payment_effect') not valid;
 begin
   perform public.audit_03c02_record_historical_capture(b.id,b.paystack_reference,1000,' zar ',now(),expected,null,b.id,('{"authorizationCode":"AUTH_audit"}'::jsonb||jsonb_build_object('customerAuthId',probe_customer,'customerEmail',probe_email)));
   raise exception 'FAIL queue failure accepted';
 exception when check_violation then if sqlerrm not like '%audit_reject_effect_queue%' then raise; end if; end;
 alter table public.failed_jobs drop constraint audit_reject_effect_queue;
 if before_capture is distinct from (select to_jsonb(x) from public.bookings x where id=b.id) then raise exception 'FAIL capture survived queue failure'; end if;
 if (select count(*) from public.failed_jobs where type='historical_payment_effect' and payload->>'bookingId'=b.id::text)<>queue_count then raise exception 'FAIL partial queue survived'; end if;
 result:=public.audit_03c02_record_historical_capture(b.id,b.paystack_reference,1000,' zar ',now(),expected,null,b.id,('{"authorizationCode":"AUTH_audit"}'::jsonb||jsonb_build_object('customerAuthId',probe_customer,'customerEmail',probe_email)));
 if (select count(*) from public.failed_jobs where type='historical_payment_effect' and payload->>'bookingId'=b.id::text)<>queue_count+7 then raise exception 'FAIL capture missing effect queue'; end if;

 if (select paystack_authorization_code from public.recurring_bookings where id=probe_plan) is distinct from 'AUTH_audit' then raise exception 'FAIL authorization missing after capture'; end if;
 if not exists(select 1 from public.bookings where id=b.id and customer_id=probe_customer and customer_email=probe_email) then raise exception 'FAIL verified identity not filled'; end if;
 if (select count(*) from public.failed_jobs where type='historical_payment_effect' and payload->>'bookingId'=b.id::text and payload->>'userId'=probe_customer::text and payload->>'customerEmail'=probe_email)<>7 then raise exception 'FAIL queued effects missing identity'; end if;
 b.customer_id:=probe_customer;
 if result->>'id' is distinct from b.id::text then raise exception 'FAIL capture row missing'; end if;
 if not exists(select 1 from public.bookings where id=b.id and amount_paid_cents=1000 and payment_status='success' and status='pending_assignment') then raise exception 'FAIL capture not recorded'; end if;

 begin
   update public.bookings set amount_paid_cents=800,total_paid_cents=800,total_paid_zar=8 where id=b.id;
   raise exception 'FAIL arbitrary paid-total edit';
 exception when check_violation then if sqlerrm<>'historical_payout_item_deferred' then raise; end if; end;
 succeeded:=jsonb_set(intent,'{refunded_cents}','200');
 succeeded:=jsonb_set(succeeded,'{records,0}',(intent->'records'->0)||jsonb_build_object(
   'provider_state','succeeded','provider_reference','audit-provider-refund','succeeded_at',now()));
 update public.bookings set amount_paid_cents=800,total_paid_cents=800,total_paid_zar=8,refund_status='partial',refunded_at=now(),
   booking_snapshot=jsonb_set(booking_snapshot,'{refund_workflow}',succeeded) where id=b.id;
 select exists(select 1 from public.user_events where booking_id=b.id and event_type='booking_created') into receipt_existed;
 select coalesce(booking_count,0),coalesce(total_spent_cents,0) into prior_count,prior_spent from public.user_profiles where id=b.customer_id;
 perform public.audit_03c02_record_payment_receipt(b.id,b.paystack_reference,1000);
 perform public.audit_03c02_record_payment_receipt(b.id,b.paystack_reference,1000);
 select count(*) into receipt_count from public.user_events where booking_id=b.id and event_type='booking_created';
 if receipt_count<>1 then raise exception 'FAIL duplicate receipt'; end if;
 if b.customer_id is not null and not exists(select 1 from public.user_profiles where id=b.customer_id
   and coalesce(booking_count,0)=coalesce(prior_count,0)+case when receipt_existed then 0 else 1 end
   and coalesce(total_spent_cents,0)=coalesce(prior_spent,0)+case when receipt_existed then 0 else 1000 end) then raise exception 'FAIL receipt counters not exactly once'; end if;

 select jsonb_object_agg(key,value) into after_basis from public.bookings x,jsonb_each(to_jsonb(x)) where x.id=b.id and key=any(keys);
 if before_basis is distinct from after_basis then raise exception 'FAIL historical pricing/roster/earnings changed'; end if;
 begin
   update public.bookings set total_paid_cents=999 where id=b.id;
   raise exception 'FAIL capture exception leaked';
 exception when check_violation then if sqlerrm<>'historical_payout_item_deferred' then raise; end if; end;
 update public.bookings set status='payment_reconciliation_required' where id=b.id;
 select jsonb_object_agg(key,value) into expected from public.bookings x,jsonb_each(to_jsonb(x))
   where x.id=b.id and key=any(array['status','paystack_reference','customer_email','customer_id','cleaner_id','selected_cleaner_id','assignment_type']);
 perform public.audit_03c02_record_historical_capture(b.id,b.paystack_reference,123,'USD',now(),expected,'currency_mismatch');
 if not exists(select 1 from public.bookings where id=b.id and status='payment_mismatch' and amount_paid_cents=800
   and booking_snapshot->'verified_capture_mismatch'->>'currency'='USD') then raise exception 'FAIL currency mismatch cash evidence'; end if;
 update public.bookings set status='payment_reconciliation_required' where id=b.id;
 perform public.audit_03c02_record_historical_capture(b.id,b.paystack_reference,123,'ZAR',now(),expected,'amount_mismatch');
 if not exists(select 1 from public.bookings where id=b.id and status='payment_mismatch' and amount_paid_cents=800
   and booking_snapshot->'verified_capture_mismatch'->>'reason'='amount_mismatch') then raise exception 'FAIL amount mismatch cash evidence'; end if;
 raise exception 'audit_probe_rollback' using errcode='Z0001';
 exception when sqlstate 'Z0001' then null;
 end;
end loop;
end $$;
rollback;
select 'PASS: verified historical refund and capture persist payment truth; arbitrary edits rejected; pricing, roster and earnings preserved; all fixtures rolled back' evidence;
