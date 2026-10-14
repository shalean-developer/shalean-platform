-- Staging-only, transaction-contained verified payment convergence probes.
begin;
select set_config('request.jwt.claim.role','service_role',true);
do $$
declare b public.bookings; intent jsonb; succeeded jsonb; expected jsonb; result jsonb; before_basis jsonb; after_basis jsonb;
 keys text[]:=array['date','cleaner_id','payout_owner_cleaner_id','team_id','base_amount_cents','service_fee_cents','price_snapshot','display_earnings_cents','internal_earnings_cents','payout_earnings_cents','cleaner_payout_cents','payout_frozen_cents'];
begin
 select * into b from public.bookings where status='pending_payment' and payout_id is null
   and monthly_invoice_id is null and billing_type='prepaid' and nullif(paystack_reference,'') is not null order by id limit 1;
 if not found then raise exception 'staging pending-payment fixture unavailable'; end if;
 intent:=jsonb_build_object('version',1,'captured_cents',1000,'refunded_cents',0,'currency','ZAR','records',jsonb_build_array(
   jsonb_build_object('id','audit-refund','amount_cents',200,'currency','ZAR','record_only',false,'provider_state','submitted_to_provider')));
 update public.bookings set booking_snapshot=coalesce(booking_snapshot,'{}')||jsonb_build_object('refund_workflow',intent) where id=b.id;
 set constraints all immediate;
 alter table public.bookings disable trigger audit_03c02_final_booking_financials;
 update public.bookings set date='2026-09-30' where id=b.id;
 set constraints all immediate;
 alter table public.bookings enable trigger audit_03c02_final_booking_financials;
 select jsonb_object_agg(key,value) into before_basis from public.bookings x,jsonb_each(to_jsonb(x)) where x.id=b.id and key=any(keys);
 select jsonb_object_agg(key,value) into expected from public.bookings x,jsonb_each(to_jsonb(x))
   where x.id=b.id and key=any(array['status','paystack_reference','customer_email','customer_id','cleaner_id','selected_cleaner_id','assignment_type']);
 begin
   perform public.audit_03c02_record_historical_capture(b.id,'wrong-reference',1000,'ZAR',now(),expected);
   raise exception 'FAIL wrong charge reference';
 exception when check_violation then if sqlerrm<>'historical_capture_identity_mismatch' then raise; end if; end;
 result:=public.audit_03c02_record_historical_capture(b.id,b.paystack_reference,1000,coalesce(b.currency,'ZAR'),now(),expected);
 if result->>'id' is distinct from b.id::text then raise exception 'FAIL capture row missing'; end if;
 if not exists(select 1 from public.bookings where id=b.id and amount_paid_cents=1000 and payment_status='success') then raise exception 'FAIL capture not recorded'; end if;
 begin
   update public.bookings set amount_paid_cents=800,total_paid_cents=800,total_paid_zar=8 where id=b.id;
   raise exception 'FAIL arbitrary paid-total edit';
 exception when check_violation then if sqlerrm<>'historical_payout_item_deferred' then raise; end if; end;
 succeeded:=jsonb_set(intent,'{refunded_cents}','200');
 succeeded:=jsonb_set(succeeded,'{records,0}',(intent->'records'->0)||jsonb_build_object(
   'provider_state','succeeded','provider_reference','audit-provider-refund','succeeded_at',now()));
 update public.bookings set amount_paid_cents=800,total_paid_cents=800,total_paid_zar=8,refund_status='partial',refunded_at=now(),
   booking_snapshot=jsonb_set(booking_snapshot,'{refund_workflow}',succeeded) where id=b.id;
 select jsonb_object_agg(key,value) into after_basis from public.bookings x,jsonb_each(to_jsonb(x)) where x.id=b.id and key=any(keys);
 if before_basis is distinct from after_basis then raise exception 'FAIL historical pricing/roster/earnings changed'; end if;
 begin
   update public.bookings set total_paid_cents=999 where id=b.id;
   raise exception 'FAIL capture exception leaked';
 exception when check_violation then if sqlerrm<>'historical_payout_item_deferred' then raise; end if; end;
end $$;
rollback;
select 'PASS: verified historical refund and capture persist payment truth; arbitrary edits rejected; pricing, roster and earnings preserved; all fixtures rolled back' evidence;
