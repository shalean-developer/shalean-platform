begin;
-- One transaction owns the receipt event and customer counters. A retry cannot double-count.
create or replace function public.audit_03c02_record_payment_receipt(p_booking_id uuid,p_reference text,p_amount_cents bigint)
returns void language plpgsql security definer set search_path=pg_catalog as $$
declare b public.bookings; inserted_count integer;
begin
 select * into b from public.bookings where id=p_booking_id for update;
 if not found or (b.date is not null and coalesce(public.audit_03c02_visit_date(b.date::text),date '-infinity') >= date '2026-10-01')
   or b.paystack_reference is distinct from p_reference or p_amount_cents is null or p_amount_cents<0
   or (coalesce(b.total_paid_cents,b.amount_paid_cents,0)<>p_amount_cents
     and not exists(select 1 from public.failed_jobs j
       where j.type in ('historical_payment_effect','historical_payment_effect_exhausted')
         and j.payload->>'effect'='receipt' and j.payload->>'bookingId'=b.id::text
         and j.payload->>'paystackReference'=p_reference and j.payload->>'amountCents'=p_amount_cents::text)
     and not exists(select 1 from public.user_events e where e.booking_id=b.id and e.event_type='booking_created'
       and e.payload->>'paystack_reference'=p_reference and e.payload->>'amount_cents'=p_amount_cents::text))
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
-- Monthly invoice cash convergence never rebuilds historical earnings or payout eligibility.
create or replace function public.audit_03c02_apply_historical_monthly_child(p_invoice_id uuid,p_booking_id uuid)
returns void language plpgsql security definer set search_path=pg_catalog as $$
declare b public.bookings; inv public.monthly_invoices; cash bigint; prior_context text;
begin
 select * into inv from public.monthly_invoices where id=p_invoice_id for update;
 if not found then raise exception 'monthly_invoice_not_found' using errcode='23514'; end if;
 select * into b from public.bookings where id=p_booking_id for update;
 if not found or b.monthly_invoice_id is distinct from inv.id or not coalesce(b.billing_type::text=any(array['monthly','recurring_invoice']),false)
   or b.status::text='cancelled' or public.audit_03c02_visit_date(b.date::text)>=date '2026-10-01'
   or (b.customer_id is not null and b.customer_id is distinct from inv.customer_id) then
   raise exception 'historical_monthly_child_mismatch' using errcode='23514';
 end if;
 cash:=greatest(0,round(coalesce(b.total_paid_zar,0)*100)::bigint);
 if cash=0 then cash:=greatest(0,coalesce(b.amount_paid_cents,0)); end if;
 prior_context:=current_setting('shalean.verified_monthly_invoice',true);
 perform set_config('shalean.verified_monthly_invoice',inv.id::text,true);
 update public.bookings set payment_status='success',amount_paid_cents=cash,
   payment_completed_at=coalesce(b.payment_completed_at,b.paid_at,b.completed_at,now())
 where id=b.id and (payment_status is distinct from 'success' or amount_paid_cents is distinct from cash or payment_completed_at is null);
 perform set_config('shalean.verified_monthly_invoice',coalesce(prior_context,''),true);
end; $$;
revoke all on function public.audit_03c02_apply_historical_monthly_child(uuid,uuid) from public,anon,authenticated,service_role;

create or replace function public.audit_03c02_settle_historical_monthly_child(p_invoice_id uuid,p_booking_id uuid)
returns void language plpgsql security definer set search_path=pg_catalog as $$
begin
 perform id from public.monthly_invoices where id=p_invoice_id and status='paid' and amount_paid_cents>=total_amount_cents for update;
 if not found then raise exception 'monthly_invoice_payment_incomplete' using errcode='23514'; end if;
 perform public.audit_03c02_apply_historical_monthly_child(p_invoice_id,p_booking_id);
end; $$;
revoke all on function public.audit_03c02_settle_historical_monthly_child(uuid,uuid) from public,anon,authenticated;
grant execute on function public.audit_03c02_settle_historical_monthly_child(uuid,uuid) to service_role;

create or replace function public.audit_03c02_reverse_historical_monthly_child(p_invoice_id uuid,p_booking_id uuid,p_restore_cents bigint,p_clear_timestamp boolean)
returns void language plpgsql security definer set search_path=pg_catalog as $$
declare b public.bookings; prior_context text;
begin
 select * into b from public.bookings where id=p_booking_id for update;
 if not found or b.monthly_invoice_id is distinct from p_invoice_id
   or public.audit_03c02_visit_date(b.date::text)>=date '2026-10-01'
   or p_restore_cents is null or p_restore_cents<0 or p_restore_cents>coalesce(b.amount_paid_cents,0) then
   raise exception 'historical_monthly_reversal_mismatch' using errcode='23514';
 end if;
 prior_context:=current_setting('shalean.verified_monthly_invoice',true);
 perform set_config('shalean.verified_monthly_invoice',p_invoice_id::text,true);
 update public.bookings set payment_status='pending_monthly',amount_paid_cents=p_restore_cents,
   payout_status=case when b.payout_status='paid' then b.payout_status else 'pending' end,
   payment_completed_at=case when p_clear_timestamp then null else b.payment_completed_at end
 where id=b.id;
 perform set_config('shalean.verified_monthly_invoice',coalesce(prior_context,''),true);
end; $$;
revoke all on function public.audit_03c02_reverse_historical_monthly_child(uuid,uuid,bigint,boolean) from public,anon,authenticated,service_role;

create or replace function public.audit_03c02_settle_monthly_children_before_paid()
returns trigger language plpgsql security definer set search_path=pg_catalog as $$
declare child record; restore_cents bigint; manual jsonb;
begin
 if OLD.status='paid' and NEW.status in ('refunded','draft') and exists(select 1 from public.bookings b where b.monthly_invoice_id=OLD.id and b.status::text<>'cancelled' and coalesce(public.audit_03c02_visit_date(b.date::text),date '-infinity')<date '2026-10-01') then
   if NEW.amount_paid_cents<>0 or NEW.customer_id is distinct from OLD.customer_id then raise exception 'historical_monthly_reversal_unverified' using errcode='23514'; end if;
   if NEW.status='refunded' then
     if NEW.refunded_at is null or nullif(NEW.refund_reference,'') is null or not (
       exists(select 1 from public.payment_transactions t where t.entity_type='monthly_invoice' and t.entity_id=OLD.id
         and t.gateway='paystack' and t.settlement_status='reversed' and t.payment_channel='refund'
         and t.raw_gateway_payload->>'refund_id'=NEW.refund_reference
         and t.amount_cents=greatest(OLD.amount_paid_cents,OLD.total_amount_cents) and t.currency_code=OLD.currency_code)
       or exists(select 1 from public.refund_accounting_records r where r.entity_type='monthly_invoice' and r.entity_id=OLD.id
         and r.refund_reference=NEW.refund_reference and r.refund_status='succeeded'
         and r.amount_cents=greatest(OLD.amount_paid_cents,OLD.total_amount_cents) and r.currency_code=OLD.currency_code)) then
       raise exception 'historical_monthly_reversal_unverified' using errcode='23514';
     end if;
   else
     select e.payload into manual from public.monthly_invoice_events e where e.invoice_id=OLD.id and e.kind='admin_mark_paid' order by e.created_at desc,e.id desc limit 1;
     if OLD.amount_paid_cents<>OLD.total_amount_cents or manual is null
       or coalesce((manual->>'amount_paid_cents_after')::bigint,OLD.total_amount_cents)<>OLD.total_amount_cents
       or coalesce((manual->>'amount_recorded_cents')::bigint,(manual->>'amount_cents')::bigint,0)<>OLD.total_amount_cents
       or exists(select 1 from public.monthly_invoice_paystack_charge_dedup where invoice_id=OLD.id)
       or exists(select 1 from public.payment_transactions where entity_type='monthly_invoice' and entity_id=OLD.id and gateway='paystack')
       or exists(select 1 from public.monthly_invoice_events where invoice_id=OLD.id and kind='payment_received')
       or exists(select 1 from public.bookings b where b.monthly_invoice_id=OLD.id and (b.payout_status='paid' or b.payout_id is not null or b.payout_run_id is not null or b.payout_paid_at is not null)) then
       raise exception 'historical_monthly_reversal_unverified' using errcode='23514';
     end if;
   end if;
   for child in select b.id from public.bookings b where b.monthly_invoice_id=OLD.id and b.status::text<>'cancelled'
     and coalesce(public.audit_03c02_visit_date(b.date::text),date '-infinity')<date '2026-10-01' order by b.id for update
   loop
     restore_cents:=0;
     if NEW.status='draft' then
       select greatest(0,coalesce((x->>'amount_paid_cents')::bigint,0)) into restore_cents
       from jsonb_array_elements(coalesce(OLD.snapshot_at_finalize->'bookings','[]'::jsonb)) x where x->>'id'=child.id::text limit 1;
     end if;
     perform public.audit_03c02_reverse_historical_monthly_child(OLD.id,child.id,coalesce(restore_cents,0),NEW.status='draft');
   end loop;
 end if;
 if NEW.status<>'paid' then return NEW; end if;
 if NEW.amount_paid_cents<NEW.total_amount_cents then raise exception 'monthly_invoice_payment_incomplete' using errcode='23514'; end if;
 for child in select b.id from public.bookings b where b.monthly_invoice_id=NEW.id and b.status::text<>'cancelled'
   and coalesce(public.audit_03c02_visit_date(b.date::text),date '-infinity')<date '2026-10-01' order by b.id for update
 loop
   perform public.audit_03c02_apply_historical_monthly_child(NEW.id,child.id);
 end loop;
 return NEW;
end; $$;
revoke all on function public.audit_03c02_settle_monthly_children_before_paid() from public,anon,authenticated,service_role;
create trigger audit_03c02_monthly_cash_before_paid before update of status on public.monthly_invoices
for each row execute function public.audit_03c02_settle_monthly_children_before_paid();
commit;
