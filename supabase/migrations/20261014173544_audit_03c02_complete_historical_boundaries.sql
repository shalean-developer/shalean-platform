-- Validate final booking values after every BEFORE policy trigger. Preserve history
-- without preventing notes, completion timestamps, or verified provider convergence.
begin;
create or replace function public.audit_03c02_verified_monthly_cash_reversal(p_old jsonb,p_new jsonb)
returns boolean language sql stable set search_path=pg_catalog as $$
 select p_new->>'monthly_invoice_id' is not null and p_new->>'monthly_invoice_id'=p_old->>'monthly_invoice_id'
   and current_setting('shalean.verified_monthly_invoice',true)=p_new->>'monthly_invoice_id'
   and p_new->>'payment_status'='pending_monthly'
   and p_new->>'payout_status'=(case when p_old->>'payout_status'='paid' then 'paid' else 'pending' end)
   and (p_new->>'amount_paid_cents')::bigint<=coalesce((p_old->>'amount_paid_cents')::bigint,0)
   and (p_new-array['payment_status','amount_paid_cents','payment_completed_at','payout_status','updated_at','payment_state'])
     = (p_old-array['payment_status','amount_paid_cents','payment_completed_at','payout_status','updated_at','payment_state']);
$$;
revoke all on function public.audit_03c02_verified_monthly_cash_reversal(jsonb,jsonb) from public,anon,authenticated,service_role;
-- Retrofit the already-deployed cutoff RPCs without changing their signatures or ACLs.
-- Retrofit canonical visit parsing and the narrowly verified invoice-cash reversal; provider and month-closure proofs remain intact.
do $patch$
declare fn record; definition text; patched text;
begin
 for fn in select p.oid,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname=any(array[
     'audit_03c02_guard_payout_batch','audit_03c02_guard_payout_item','bookings_lock_under_finalized_monthly_invoice','upsert_pending_payout_earnings',
     'append_draft_run_payout_earnings','settle_cleaner_payout_bank_transfer','adjust_unrun_member_payout_earnings','claim_cleaner_earnings_for_paystack'])
 loop
   definition:=pg_get_functiondef(fn.oid); patched:=definition;
   patched:=replace(patched,'b.date::date','coalesce(public.audit_03c02_visit_date(b.date::text),date ''-infinity'')');
   patched:=replace(patched,'OLD.date::date','coalesce(public.audit_03c02_visit_date(OLD.date::text),date ''-infinity'')');
   patched:=replace(patched,'NEW.date::date','coalesce(public.audit_03c02_visit_date(NEW.date::text),date ''-infinity'')');
   patched:=replace(patched,'v_date := NEW.date;','v_date := public.audit_03c02_visit_date(NEW.date::text);');
   if fn.proname='audit_03c02_guard_payout_item' then
     patched:=replace(patched,'  if TG_OP=''UPDATE'' then',$cash_reversal$
  if TG_OP='UPDATE' and TG_TABLE_NAME='bookings' then
    if public.audit_03c02_verified_monthly_cash_reversal(to_jsonb(OLD),to_jsonb(NEW)) then return NEW; end if;
  end if;
  if TG_OP='UPDATE' then$cash_reversal$);
   end if;
   if fn.proname='bookings_lock_under_finalized_monthly_invoice' then
     patched:=replace(patched,'  if old.monthly_invoice_id is null then',$invoice_reversal$
  if public.audit_03c02_verified_monthly_cash_reversal(to_jsonb(OLD),to_jsonb(NEW)) then return NEW; end if;
  if old.monthly_invoice_id is null then$invoice_reversal$);
   end if;
   if patched<>definition then execute patched; end if;
 end loop;
end $patch$;
-- Refund confirmation may reconcile paid totals only against an existing provider intent.
create or replace function public.audit_03c02_verified_booking_refund(p_old jsonb,p_new jsonb)
returns boolean language plpgsql immutable set search_path=pg_catalog as $$
declare a jsonb:=p_old->'booking_snapshot'->'refund_workflow'; z jsonb:=p_new->'booking_snapshot'->'refund_workflow';
 r jsonb; prior jsonb; changed integer:=0; delta bigint:=0; remaining bigint;
begin
 if nullif(p_old->>'paystack_reference','') is null or p_old->>'paystack_reference' is distinct from p_new->>'paystack_reference'
   or a is null or z is null or a->>'captured_cents' is distinct from z->>'captured_cents'
   or a->>'currency' is distinct from z->>'currency' or jsonb_typeof(a->'records')<>'array' or jsonb_typeof(z->'records')<>'array'
   or jsonb_array_length(a->'records')<>jsonb_array_length(z->'records') then return false; end if;
 for r in select value from jsonb_array_elements(z->'records') loop
   select value into prior from jsonb_array_elements(a->'records') where value->>'id'=r->>'id';
   if prior is null then return false; end if;
   if prior is distinct from r then
     if prior->>'provider_state' not in ('submitted_to_provider','pending') or r->>'provider_state'<>'succeeded'
       or coalesce((prior->>'record_only')::boolean,true) or coalesce((r->>'record_only')::boolean,true)
       or nullif(r->>'provider_reference','') is null or nullif(r->>'succeeded_at','') is null
       or (prior-array['provider_state','provider_reference','provider_outcome','updated_at','succeeded_at','failed_at'])
         is distinct from (r-array['provider_state','provider_reference','provider_outcome','updated_at','succeeded_at','failed_at'])
       or (r->>'amount_cents')::bigint<=0 then return false; end if;
     changed:=changed+1; delta:=(r->>'amount_cents')::bigint;
   end if;
 end loop;
 remaining:=(z->>'captured_cents')::bigint-(z->>'refunded_cents')::bigint;
 return changed=1 and remaining>0 and p_new->>'refund_status'='partial'
   and (z->>'refunded_cents')::bigint=(a->>'refunded_cents')::bigint+delta
   and (p_new->>'amount_paid_cents')::bigint=remaining and (p_new->>'total_paid_cents')::bigint=remaining
   and (p_new->>'total_paid_zar')::numeric=remaining::numeric/100;
exception when invalid_text_representation or numeric_value_out_of_range then return false;
end; $$;
revoke all on function public.audit_03c02_verified_booking_refund(jsonb,jsonb) from public,anon,authenticated,service_role;

-- Called only after the server has verified Paystack success. No provider request
-- is made here. Retain the historical service, roster, pricing and earnings basis.
create or replace function public.audit_03c02_record_historical_capture(p_booking_id uuid,p_reference text,p_amount_cents bigint,p_currency text,p_paid_at timestamptz,p_expected jsonb,p_mismatch text default null,p_verified_booking_id uuid default null,p_effect_context jsonb default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare b public.bookings; result jsonb; prior_context text;
begin
 p_currency:=upper(public.audit_03c02_trim(p_currency));
 select * into b from public.bookings where id=p_booking_id for update;
 if not found or (b.date is not null and coalesce(public.audit_03c02_visit_date(b.date::text),date '-infinity')>=date '2026-10-01')
   or b.status::text not in ('pending_payment','payment_expired','payment_reconciliation_required')
   or nullif(p_reference,'') is null
   or (b.paystack_reference is distinct from p_reference and not (coalesce(p_verified_booking_id=b.id,false)
     and (b.paystack_reference is null or b.paystack_reference=b.id::text)))
   or p_amount_cents is null or p_amount_cents<0 or nullif(p_currency,'') is null
   or (p_mismatch is null and p_currency is distinct from coalesce(nullif(upper(public.audit_03c02_trim(b.currency)),''),'ZAR'))
   or (p_mismatch is not null and p_mismatch not in ('amount_mismatch','currency_mismatch'))
   or p_paid_at is null or p_expected is null or not (to_jsonb(b) @> p_expected)
   or not (p_expected ? 'customer_id' or p_expected ? 'user_id')
   or not (p_expected ?& array['status','paystack_reference','customer_email','cleaner_id','selected_cleaner_id','assignment_type']) then
   raise exception 'historical_capture_identity_mismatch' using errcode='23514';
 end if;
 if (b.customer_id is not null and nullif(p_effect_context->>'customerAuthId','') is not null
     and b.customer_id is distinct from (p_effect_context->>'customerAuthId')::uuid)
   or (nullif(public.audit_03c02_trim(b.customer_email),'') is not null and nullif(public.audit_03c02_trim(p_effect_context->>'customerEmail'),'') is not null
     and lower(public.audit_03c02_trim(b.customer_email))<>lower(public.audit_03c02_trim(p_effect_context->>'customerEmail'))) then
   raise exception 'historical_capture_identity_mismatch' using errcode='23514';
 end if;
 -- Only fill missing verified identity; never rewrite established ownership or email.
 b.customer_id:=coalesce(b.customer_id,nullif(p_effect_context->>'customerAuthId','')::uuid);
 if nullif(public.audit_03c02_trim(b.customer_email),'') is null then b.customer_email:=nullif(public.audit_03c02_trim(p_effect_context->>'customerEmail'),''); end if;
 if p_mismatch is not null then
   -- Keep foreign-currency/wrong-amount cash evidence separate from the old ZAR
   -- entitlement inputs. This is reconciliation, never a successful fulfillment.
   update public.bookings set customer_id=b.customer_id,customer_email=b.customer_email,paystack_reference=p_reference,status='payment_mismatch',payment_mismatch=true,payment_completed_at=p_paid_at,
     booking_snapshot=coalesce(b.booking_snapshot,'{}'::jsonb)||jsonb_build_object('verified_capture_mismatch',jsonb_build_object(
       'reference',p_reference,'amount_cents',p_amount_cents,'currency',p_currency,'paid_at',p_paid_at,'reason',p_mismatch)),
     updated_at=now() where id=b.id;
   return jsonb_build_object('id',b.id,'created_at',b.created_at);
 end if;
 prior_context:=current_setting('shalean.verified_booking_capture',true);
 perform set_config('shalean.verified_booking_capture',b.id::text,true);
 update public.bookings set customer_id=b.customer_id,customer_email=b.customer_email,paystack_reference=p_reference,amount_paid_cents=p_amount_cents,total_paid_cents=p_amount_cents,total_paid_zar=p_amount_cents::numeric/100,
   payment_completed_at=p_paid_at,payment_status=case when b.payment_status='pending_monthly' then b.payment_status else 'success' end,
   status=case when b.cleaner_id is not null or b.selected_cleaner_id is not null then 'pending_assignment' else 'pending' end,updated_at=now() where id=b.id;
 perform set_config('shalean.verified_booking_capture',coalesce(prior_context,''),true);
 -- Authorization belongs to this capture transaction, never a lossy post-capture write.
 if b.recurring_id is not null and nullif(btrim(p_effect_context->>'authorizationCode'),'') is not null then
   update public.recurring_bookings set paystack_authorization_code=btrim(p_effect_context->>'authorizationCode'),updated_at=now() where id=b.recurring_id;
   if not found then raise exception 'recurring_authorization_plan_missing' using errcode='23514'; end if;
 end if;
 -- Capture and all required follow-up tasks commit together. Any queue error rolls back cash/status too.
 insert into public.failed_jobs(type,payload)
 select 'historical_payment_effect',jsonb_build_object(
   'bookingId',b.id,'userId',coalesce(to_jsonb(b)->'customer_id',to_jsonb(b)->'user_id'),
   'customerEmail',b.customer_email,'amountCents',p_amount_cents,'paystackReference',p_reference,
   'paidAtIso',p_paid_at,'cityId',coalesce(p_effect_context->'cityId',to_jsonb(b)->'city_id'),
   'referralCode',coalesce(p_effect_context->>'referralCode',''),'effect',effect)
 from unnest(array['payment_state','cancel_recovery','receipt','referral','city','growth','conversion']) effect;

 select jsonb_build_object('id',id,'created_at',created_at,'customer_id',customer_id) into result from public.bookings where id=b.id;
 return result;
end; $$;
revoke all on function public.audit_03c02_record_historical_capture(uuid,text,bigint,text,timestamptz,jsonb,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.audit_03c02_record_historical_capture(uuid,text,bigint,text,timestamptz,jsonb,text,uuid,jsonb) to service_role;

create or replace function public.audit_03c02_guard_final_booking_financials()
returns trigger language plpgsql security definer set search_path=pg_catalog as $$
declare v_keys text[] := array[
 'monthly_invoice_id','billing_type','date','time','assigned_at','service','service_slug','base_amount_cents','service_fee_cents','total_paid_zar','total_paid_cents','amount_paid_cents','price_snapshot','cleaner_id','payout_owner_cleaner_id','team_id','is_team_job','cleaner_count','team_member_count_snapshot',
 'cleaner_payout_cents','cleaner_bonus_cents','display_earnings_cents','internal_earnings_cents',
 'payout_earnings_cents','cleaner_earnings_total_cents','company_revenue_cents','payout_frozen_cents',
 'cleaner_share_percentage','earnings_summary','cleaner_line_earnings_finalized_at','earnings_model_version','payout_percentage','payout_type',
 'earnings_percentage_applied','earnings_cap_cents_applied','earnings_tenure_months_at_assignment'];
 v_before jsonb; v_after jsonb;
begin
 if TG_OP='DELETE' then
   if OLD.date is null or coalesce(public.audit_03c02_visit_date(OLD.date::text),date '-infinity') < date '2026-10-01' then
     raise exception 'historical_payout_item_deferred' using errcode='23514';
   end if;
   return OLD;
 end if;
 if TG_OP='INSERT' then
   if NEW.date is null or coalesce(public.audit_03c02_visit_date(NEW.date::text),date '-infinity') < date '2026-10-01' then
     raise exception 'historical_payout_item_deferred' using errcode='23514';
   end if;
   return NEW;
 end if;
 if current_setting('shalean.verified_booking_capture',true)=NEW.id::text
   or (coalesce(nullif(current_setting('request.jwt.claim.role',true),''),current_setting('request.jwt.claims',true)::jsonb->>'role')='service_role'
     and public.audit_03c02_verified_booking_refund(to_jsonb(OLD),to_jsonb(NEW))) then
   v_keys:=array_remove(array_remove(array_remove(v_keys,'total_paid_zar'),'total_paid_cents'),'amount_paid_cents');
 end if;
 if NEW.monthly_invoice_id is not null and NEW.monthly_invoice_id is not distinct from OLD.monthly_invoice_id
   and current_setting('shalean.verified_monthly_invoice',true)=NEW.monthly_invoice_id::text then
   v_keys:=array_remove(v_keys,'amount_paid_cents');
 end if;
 select jsonb_object_agg(key,value) into v_before from jsonb_each(to_jsonb(OLD)) where key=any(v_keys);
 select jsonb_object_agg(key,value) into v_after from jsonb_each(to_jsonb(NEW)) where key=any(v_keys);
 v_before:=v_before || jsonb_build_object('locked_booking_basis',to_jsonb(OLD)->'booking_snapshot'->'locked');
 v_after:=v_after || jsonb_build_object('locked_booking_basis',to_jsonb(NEW)->'booking_snapshot'->'locked');
 if v_before is distinct from v_after and
   (OLD.date is null or coalesce(public.audit_03c02_visit_date(OLD.date::text),date '-infinity') < date '2026-10-01' or NEW.date is null or coalesce(public.audit_03c02_visit_date(NEW.date::text),date '-infinity') < date '2026-10-01') then
   raise exception 'historical_payout_item_deferred' using errcode='23514';
 end if;
 return NEW;
end; $$;
revoke all on function public.audit_03c02_guard_final_booking_financials() from public,anon,authenticated,service_role;
create trigger audit_03c02_final_booking_financials after insert or update on public.bookings
for each row execute function public.audit_03c02_guard_final_booking_financials();
create trigger audit_03c02_booking_delete_boundary before delete on public.bookings
for each row execute function public.audit_03c02_guard_final_booking_financials();

-- Check identity against both parents, even when amount and status are unchanged.
create or replace function public.audit_03c02_guard_financial_item_identity()
returns trigger language plpgsql security definer set search_path=pg_catalog as $$
declare v_booking uuid; v_date date; v_identity_changed boolean; v_old_booking uuid;
begin
 if TG_OP='INSERT' then
   v_identity_changed:=true;
 else
   v_old_booking:=OLD.booking_id;
   v_identity_changed := NEW.booking_id is distinct from OLD.booking_id
     or NEW.cleaner_id is distinct from OLD.cleaner_id
     or to_jsonb(NEW)->'team_id' is distinct from to_jsonb(OLD)->'team_id';
   if TG_TABLE_NAME='cleaner_earnings' then
     -- Freeze entitlement and approval metadata as well as attribution.
     -- Only previously verified provider outcomes may converge an existing claim.
     if OLD.status::text='processing' and NEW.status::text='approved'
       and OLD.disbursement_id is not null and NEW.disbursement_id is null
       and (to_jsonb(NEW)-array['status','disbursement_id','updated_at'])=(to_jsonb(OLD)-array['status','disbursement_id','updated_at'])
       and public.audit_03c02_has_verified_outcome(OLD.disbursement_id,'cleaner_earnings','failed')
       and not public.audit_03c02_has_verified_outcome(OLD.disbursement_id,'cleaner_earnings','success') then return NEW; end if;
     if OLD.status::text in ('processing','paid') and NEW.status::text='paid'
       and OLD.disbursement_id is not null
       and (to_jsonb(NEW)-array['status','paid_at','updated_at'])=(to_jsonb(OLD)-array['status','paid_at','updated_at'])
       and (OLD.paid_at is null or NEW.paid_at is not distinct from OLD.paid_at)
       and public.audit_03c02_has_verified_outcome(OLD.disbursement_id,'cleaner_earnings','success') then return NEW; end if;
     v_identity_changed:=(to_jsonb(NEW)-'updated_at') is distinct from (to_jsonb(OLD)-'updated_at');
   end if;
 end if;
 if not v_identity_changed then return NEW; end if;
 -- Consistent parent order prevents opposite-direction rekeys from deadlocking.
 for v_booking,v_date in
   select b.id,coalesce(public.audit_03c02_visit_date(b.date::text),date '-infinity') from public.bookings b
   where b.id=NEW.booking_id or b.id=v_old_booking
   order by b.id for update
 loop
   if v_date is null or v_date < date '2026-10-01' then
     raise exception 'historical_payout_item_deferred' using errcode='23514';
   end if;
 end loop;
 if not exists(select 1 from public.bookings b where b.id=NEW.booking_id) then
   raise exception 'historical_payout_item_deferred' using errcode='23514';
 end if;
 return NEW;
end; $$;
revoke all on function public.audit_03c02_guard_financial_item_identity() from public,anon,authenticated,service_role;
create trigger audit_03c02_a_ledger_identity before insert or update on public.cleaner_earnings
for each row execute function public.audit_03c02_guard_financial_item_identity();
create trigger audit_03c02_a_roster_payout_identity before insert or update on public.booking_roster_member_payouts
for each row execute function public.audit_03c02_guard_financial_item_identity();
create trigger audit_03c02_a_team_payout_identity before insert or update on public.team_job_member_payouts
for each row execute function public.audit_03c02_guard_financial_item_identity();
-- Line-level and snapshot writes must obey the same parent boundary.
create or replace function public.audit_03c02_guard_detail_financials()
returns trigger language plpgsql security definer set search_path=pg_catalog as $$
declare v_old_booking uuid; v_new_booking uuid; v_date date; v_before jsonb; v_after jsonb;
begin
 if TG_OP<>'INSERT' then v_old_booking:=OLD.booking_id; end if;
 if TG_OP<>'DELETE' then v_new_booking:=NEW.booking_id; end if;
 if TG_OP='UPDATE' then
   if TG_TABLE_NAME='booking_line_items' then
     select jsonb_object_agg(key,value) into v_before from jsonb_each(to_jsonb(OLD))
       where key=any(array['booking_id','cleaner_earnings_cents','total_price_cents','unit_price_cents','quantity','earns_cleaner','item_type','slug','name','metadata']);
     select jsonb_object_agg(key,value) into v_after from jsonb_each(to_jsonb(NEW))
       where key=any(array['booking_id','cleaner_earnings_cents','total_price_cents','unit_price_cents','quantity','earns_cleaner','item_type','slug','name','metadata']);
   elsif TG_TABLE_NAME='cleaner_earnings_adjustments' and pg_trigger_depth()>1
     and to_jsonb(OLD)->>'created_by' is not null and to_jsonb(NEW)->>'created_by' is null then
     -- Only the FK-driven creator nulling is operational; retain audit email.
     v_before:=to_jsonb(OLD)-array['updated_at','created_by']; v_after:=to_jsonb(NEW)-array['updated_at','created_by'];
   else
     v_before:=to_jsonb(OLD)-'updated_at'; v_after:=to_jsonb(NEW)-'updated_at';
   end if;
   if v_before is not distinct from v_after then return NEW; end if;
 end if;
 if TG_TABLE_NAME='booking_cleaner_earnings_snapshot_lines' and TG_OP<>'DELETE' then
   if not exists(select 1 from public.booking_line_items li where li.id=NEW.booking_line_item_id and li.booking_id=NEW.booking_id) then
     raise exception 'snapshot_line_booking_mismatch' using errcode='23514';
   end if;
 end if;
 perform b.id from public.bookings b where b.id in (v_old_booking,v_new_booking) order by b.id for update;
 if TG_OP='DELETE' and not found and pg_trigger_depth()>1 then return OLD; end if;
 if not exists(select 1 from public.bookings b where b.id=coalesce(v_new_booking,v_old_booking))
   or exists(select 1 from public.bookings b where b.id in (v_old_booking,v_new_booking)
     and (b.date is null or coalesce(public.audit_03c02_visit_date(b.date::text),date '-infinity') < date '2026-10-01')) then
   raise exception 'historical_payout_item_deferred' using errcode='23514';
 end if;
 if TG_OP='DELETE' then return OLD; end if;
 return NEW;
end; $$;
revoke all on function public.audit_03c02_guard_detail_financials() from public,anon,authenticated,service_role;
create trigger audit_03c02_line_financials before insert or update or delete on public.booking_line_items
for each row execute function public.audit_03c02_guard_detail_financials();
create trigger audit_03c02_snapshot_financials before insert or update or delete on public.booking_cleaner_earnings_snapshot
for each row execute function public.audit_03c02_guard_detail_financials();
create trigger audit_03c02_snapshot_line_financials before insert or update or delete on public.booking_cleaner_earnings_snapshot_lines
for each row execute function public.audit_03c02_guard_detail_financials();
create trigger audit_03c02_manual_adjustment_financials before insert or update or delete on public.cleaner_earnings_adjustments
for each row execute function public.audit_03c02_guard_detail_financials();
-- Canonical payout resolution reads the cleaner's live effective tenure anchor.
-- Preserve it when any historical attribution can resolve this cleaner.
create or replace function public.audit_03c02_guard_cleaner_tenure()
returns trigger language plpgsql security definer set search_path=pg_catalog as $$
begin
 if coalesce(OLD.joined_at,OLD.created_at) is not distinct from coalesce(NEW.joined_at,NEW.created_at) then return NEW; end if;
 if exists (
   select 1 from public.bookings b
   where (b.date is null or coalesce(public.audit_03c02_visit_date(b.date::text),date '-infinity') < date '2026-10-01') and (
     OLD.id in (b.cleaner_id,b.selected_cleaner_id,b.payout_owner_cleaner_id)
     or exists(select 1 from public.booking_cleaners x where x.booking_id=b.id and x.cleaner_id=OLD.id)
     or exists(select 1 from public.cleaner_earnings x where x.booking_id=b.id and x.cleaner_id=OLD.id)
     or exists(select 1 from public.booking_roster_member_payouts x where x.booking_id=b.id and x.cleaner_id=OLD.id)
     or exists(select 1 from public.team_job_member_payouts x where x.booking_id=b.id and x.cleaner_id=OLD.id)
     or exists(select 1 from public.booking_cleaner_earnings_snapshot x where x.booking_id=b.id and x.cleaner_id=OLD.id)
     or exists(select 1 from public.cleaner_earnings_adjustments x where x.booking_id=b.id and x.cleaner_id=OLD.id)
   )
 ) then raise exception 'historical_cleaner_tenure_deferred' using errcode='23514'; end if;
 return NEW;
end; $$;
revoke all on function public.audit_03c02_guard_cleaner_tenure() from public,anon,authenticated,service_role;
create trigger audit_03c02_cleaner_tenure after update on public.cleaners
for each row execute function public.audit_03c02_guard_cleaner_tenure();
-- Approval skips deferred rows rather than letting one historical row abort a cleaner's current approvals.
create or replace function public.audit_03c02_approve_current_cleaner_earnings(p_cleaner_id uuid,p_approved_at timestamptz)
returns setof public.cleaner_earnings language plpgsql security definer set search_path=pg_catalog as $$
declare candidate record; visit_date date;
begin
 if p_cleaner_id is null or p_approved_at is null then raise exception 'invalid_earnings_approval' using errcode='23514'; end if;
 for candidate in select ce.id,b.date from public.cleaner_earnings ce join public.bookings b on b.id=ce.booking_id
   where ce.cleaner_id=p_cleaner_id and ce.status='pending' order by b.id,ce.id for update of b,ce
 loop
   visit_date:=public.audit_03c02_visit_date(candidate.date::text);
   if visit_date is null or visit_date<date '2026-10-01' then continue; end if;
   return query update public.cleaner_earnings set status='approved',approved_at=p_approved_at
     where id=candidate.id and status='pending' returning *;
 end loop;
end; $$;
revoke all on function public.audit_03c02_approve_current_cleaner_earnings(uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.audit_03c02_approve_current_cleaner_earnings(uuid,timestamptz) to service_role;
commit;
