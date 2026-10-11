-- AUDIT-02A04: protect financially material booking history from hard delete.
--
-- App-layer guards already reject paid/invoiced/payout-linked bookings. This
-- database trigger closes the service-role/direct-SQL bypass demonstrated by
-- the July historical exception. Unpaid, financially-unlinked cleanup rows
-- remain deletable.

create or replace function public.block_financial_booking_hard_delete()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if lower(trim(coalesce(old.status, ''))) = 'completed'
     or old.completed_at is not null
     or old.cleaner_line_earnings_finalized_at is not null
     or old.marked_paid_by_admin_id is not null
     or old.zoho_invoice_id is not null
     or old.refunded_at is not null
     or nullif(trim(coalesce(old.refund_status, '')), '') is not null
     or old.payout_paid_at is not null
     or old.payout_run_id is not null
     or nullif(trim(coalesce(old.payment_reference_external, '')), '') is not null
     or old.payment_completed_at is not null
     or lower(trim(coalesce(old.payment_status, ''))) in ('paid', 'success', 'succeeded', 'pending_monthly')
     or coalesce(old.is_monthly_billing_booking, false)
     or coalesce(old.amount_paid_cents, 0) > 0
     or coalesce(old.deposit_paid_cents, 0) > 0
     or coalesce(old.total_paid_cents, 0) > 0
     or coalesce(old.total_paid_zar, 0) > 0
     or old.payment_transaction_id is not null
     or exists (
       select 1
       from public.payment_transactions pt
       where pt.booking_id = old.id
          or (pt.entity_type = 'booking' and pt.entity_id = old.id)
     )
     or exists (
       select 1
       from public.expenses e
       where e.booking_id = old.id
     )
     or exists (
       select 1
       from public.inventory_movements im
       where im.booking_id = old.id
     )
     or exists (
       select 1
       from public.transport_cost_entries tce
       where tce.booking_id = old.id
     )
     or exists (
       select 1
       from public.cleaning_credit_transactions cct
       where cct.booking_id = old.id
     )
     or exists (
       select 1
       from public.invoice_adjustments ia
       where ia.booking_id = old.id
     )
     or exists (
       select 1
       from public.refund_accounting_records rar
       where rar.entity_type = 'booking'
         and rar.entity_id = old.id
     )
     or exists (
       select 1
       from public.referral_discount_redemptions rdr
       where rdr.booking_id = old.id
     )
     or exists (
       select 1
       from public.referral_events re
       where re.booking_id = old.id
     )
     or exists (
       select 1
       from public.admin_money_action_proposals amap
       where amap.booking_id = old.id
     )
     or exists (
       select 1
       from public.accounting_invoice_sync ais
       where ais.booking_id = old.id
          or (ais.entity_type = 'booking' and ais.entity_id = old.id)
     )
     or exists (
       select 1
       from public.accounting_sync_records asr
       where asr.entity_type = 'booking'
         and asr.entity_id = old.id
     )
     or exists (
       select 1
       from public.admin_earnings_actions aea
       where aea.booking_id = old.id
     )
     or exists (
       select 1
       from public.booking_changes bc
       where bc.booking_id = old.id
     )
     or exists (
       select 1
       from public.growth_action_outcomes gao
       where gao.booking_id = old.id
     )
     or exists (
       select 1
       from public.conversion_experiment_results cer
       where cer.booking_id = old.id
     )
     or exists (
       select 1
       from public.email_campaign_attributions eca
       where eca.booking_id = old.id
     )
     or exists (
       select 1
       from public.promotion_redemptions prd
       where prd.booking_id = old.id
     )
     or exists (
       select 1
       from public.booking_cleaner_earnings_snapshot bces
       where bces.booking_id = old.id
     )
     or exists (
       select 1
       from public.booking_cleaner_earnings_snapshot_lines bcesl
       where bcesl.booking_id = old.id
     )
     or exists (
       select 1
       from public.booking_line_items bli
       where bli.booking_id = old.id
         and coalesce(bli.cleaner_earnings_cents, 0) > 0
     )
     or exists (
       select 1
       from public.cleaner_earnings ce
       where ce.booking_id = old.id
     )
     or exists (
       select 1
       from public.cleaner_earnings_adjustments cea
       where cea.booking_id = old.id
     )
     or exists (
       select 1
       from public.cleaner_earnings_disputes ced
       where ced.booking_id = old.id
     )
     or exists (
       select 1
       from public.team_job_member_payouts tjmp
       where tjmp.booking_id = old.id
     )
     or exists (
       select 1
       from public.booking_roster_member_payouts brmp
       where brmp.booking_id = old.id
     )
     or exists (
       select 1
       from public.payout_audit_events pae
       where old.id = any(coalesce(pae.booking_ids, '{}'::uuid[]))
     )
     or old.monthly_invoice_id is not null
     or old.sales_document_id is not null
     or old.payout_id is not null
     or lower(trim(coalesce(old.payout_status, ''))) in ('eligible', 'approved', 'processing', 'paid')
     or coalesce(old.payout_frozen_cents, 0) > 0
     or coalesce(old.display_earnings_cents, 0) > 0
     or coalesce(old.cleaner_payout_cents, 0) > 0
     or coalesce(old.cleaner_bonus_cents, 0) > 0
     or coalesce(old.payout_earnings_cents, 0) > 0
     or coalesce(old.cleaner_earnings_total_cents, 0) > 0
     or coalesce(old.internal_earnings_cents, 0) > 0
     or old.paid_at is not null
  then
    raise exception 'booking_delete_blocked_financial_history'
      using errcode = '23514',
            hint = 'Financially material bookings must be retained. Cancel/expire instead of hard deleting.';
  end if;

  return old;
end;
$$;

drop trigger if exists trg_bookings_block_financial_hard_delete on public.bookings;
create trigger trg_bookings_block_financial_hard_delete
before delete on public.bookings
for each row execute function public.block_financial_booking_hard_delete();

revoke all on function public.block_financial_booking_hard_delete() from public, anon, authenticated;


-- Specialized sales-document cleanup boundary.
-- The booking row is locked before validation, unlink, and delete so a concurrent
-- payment/expense insert cannot race between validation and hard delete.
create or replace function public.delete_unpaid_sales_document_booking(p_invoice_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.bookings%rowtype;
begin
  select *
    into v
    from public.bookings
   where sales_document_id = p_invoice_id
   for update;

  if not found then
    return jsonb_build_object('ok', true, 'booking_id', null);
  end if;

  if lower(trim(coalesce(v.status, ''))) not in ('pending_payment', 'pending', 'cancelled') then
    return jsonb_build_object('ok', false, 'booking_id', v.id, 'error', 'booking_not_unpaid_deletable_state');
  end if;

  if lower(trim(coalesce(v.status, ''))) = 'cancelled'
     and (
       coalesce(v.metadata -> 'audit02a04_provisional_rollback' ->> 'kind', '') <> 'line_item_persist_failed'
       or coalesce(v.metadata -> 'audit02a04_provisional_rollback' ->> 'source', '') <> 'sales_document_quote'
     )
  then
    return jsonb_build_object('ok', false, 'booking_id', v.id, 'error', 'not_provisional_line_item_rollback');
  end if;

  if v.payment_completed_at is not null
     or lower(trim(coalesce(v.payment_status, ''))) in ('paid', 'success', 'succeeded')
     or coalesce(v.amount_paid_cents, 0) > 0
     or coalesce(v.deposit_paid_cents, 0) > 0
     or coalesce(v.total_paid_cents, 0) > 0
     or coalesce(v.total_paid_zar, 0) > 0
     or v.payment_transaction_id is not null
     or exists (
       select 1
       from public.payment_transactions pt
       where pt.booking_id = v.id
          or (pt.entity_type = 'booking' and pt.entity_id = v.id)
     )
  then
    return jsonb_build_object('ok', false, 'booking_id', v.id, 'error', 'linked_paid_booking');
  end if;

  if exists (
    select 1
    from public.expenses e
    where e.booking_id = v.id
  ) then
    return jsonb_build_object('ok', false, 'booking_id', v.id, 'error', 'linked_booking_expense');
  end if;

  update public.bookings
     set sales_document_id = null
   where id = v.id
     and sales_document_id = p_invoice_id;

  delete from public.bookings where id = v.id;

  return jsonb_build_object('ok', true, 'booking_id', v.id);
end;
$$;

revoke all on function public.delete_unpaid_sales_document_booking(uuid) from public, anon, authenticated;
grant execute on function public.delete_unpaid_sales_document_booking(uuid) to service_role;

-- Atomic repair for a paid sales-document booking whose first line-item persistence
-- failed and left the retained booking cancelled. Replacement line items and
-- reactivation happen under the same booking row lock/transaction, so retries
-- cannot duplicate financial lines.
create or replace function public.repair_paid_cancelled_sales_document_booking(
  p_invoice_id uuid,
  p_line_items jsonb,
  p_total_price numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $paid_sales_repair$
declare
  v public.bookings%rowtype;
  v_inserted integer := 0;
begin
  select *
    into v
    from public.bookings
   where sales_document_id = p_invoice_id
   for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'booking_not_found');
  end if;

  if lower(trim(coalesce(v.status, ''))) <> 'cancelled' then
    return jsonb_build_object('ok', false, 'error', 'booking_not_cancelled', 'booking_id', v.id);
  end if;

  if coalesce(v.metadata -> 'audit02a04_provisional_rollback' ->> 'kind', '') <> 'line_item_persist_failed'
     or coalesce(v.metadata -> 'audit02a04_provisional_rollback' ->> 'source', '') <> 'sales_document_quote'
  then
    return jsonb_build_object('ok', false, 'error', 'not_provisional_line_item_rollback', 'booking_id', v.id);
  end if;

  if not (
    v.payment_completed_at is not null
    or lower(trim(coalesce(v.payment_status, ''))) in ('paid', 'success', 'succeeded')
    or coalesce(v.amount_paid_cents, 0) > 0
    or coalesce(v.deposit_paid_cents, 0) > 0
    or coalesce(v.total_paid_cents, 0) > 0
    or coalesce(v.total_paid_zar, 0) > 0
    or v.payment_transaction_id is not null
    or exists (
      select 1
      from public.payment_transactions pt
      where pt.booking_id = v.id
         or (pt.entity_type = 'booking' and pt.entity_id = v.id)
    )
  ) then
    return jsonb_build_object('ok', false, 'error', 'booking_not_paid', 'booking_id', v.id);
  end if;

  if jsonb_typeof(p_line_items) <> 'array' or jsonb_array_length(p_line_items) = 0 then
    return jsonb_build_object('ok', false, 'error', 'line_items_required', 'booking_id', v.id);
  end if;

  delete from public.booking_line_items where booking_id = v.id;

  insert into public.booking_line_items(
    booking_id,
    item_type,
    slug,
    name,
    quantity,
    unit_price_cents,
    total_price_cents,
    pricing_source,
    metadata,
    earns_cleaner,
    cleaner_earnings_cents
  )
  select
    v.id,
    x.item_type,
    x.slug,
    x.name,
    x.quantity,
    x.unit_price_cents,
    x.total_price_cents,
    x.pricing_source,
    coalesce(x.metadata, '{}'::jsonb),
    coalesce(x.earns_cleaner, x.item_type <> 'adjustment'),
    x.cleaner_earnings_cents
  from jsonb_to_recordset(p_line_items) as x(
    item_type text,
    slug text,
    name text,
    quantity integer,
    unit_price_cents integer,
    total_price_cents integer,
    pricing_source text,
    metadata jsonb,
    earns_cleaner boolean,
    cleaner_earnings_cents integer
  );

  get diagnostics v_inserted = row_count;

  if v_inserted = 0 then
    raise exception 'paid_sales_document_repair_inserted_zero_lines'
      using errcode = '23514';
  end if;

  update public.bookings
     set status = 'pending',
         dispatch_status = 'searching',
         total_price = p_total_price,
         metadata = coalesce(metadata, '{}'::jsonb) - 'audit02a04_provisional_rollback',
         updated_at = now()
   where id = v.id;

  return jsonb_build_object('ok', true, 'booking_id', v.id, 'line_items', v_inserted);
end;
$paid_sales_repair$;

revoke all on function public.repair_paid_cancelled_sales_document_booking(uuid, jsonb, numeric)
  from public, anon, authenticated;
grant execute on function public.repair_paid_cancelled_sales_document_booking(uuid, jsonb, numeric)
  to service_role;



-- Read-only source-of-truth probe used before reversing an applied promotion.
-- Promotion redemption itself is intentionally excluded because the purge may
-- reverse an abandoned checkout promotion; every other protected financial
-- signal keeps the booking untouched for recovery/reconciliation.
create or replace function public.booking_has_nonpromotion_financial_history(p_booking_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $financial_history$
  select exists (
    select 1
    from public.bookings b
    where b.id = p_booking_id
      and (
        lower(trim(coalesce(b.status, ''))) = 'completed'
        or b.completed_at is not null
        or b.cleaner_line_earnings_finalized_at is not null
        or b.marked_paid_by_admin_id is not null
        or b.zoho_invoice_id is not null
        or b.refunded_at is not null
        or nullif(trim(coalesce(b.refund_status, '')), '') is not null
        or b.payout_paid_at is not null
        or b.payout_run_id is not null
        or nullif(trim(coalesce(b.payment_reference_external, '')), '') is not null
        or b.payment_completed_at is not null
        or lower(trim(coalesce(b.payment_status, ''))) in ('paid', 'success', 'succeeded', 'pending_monthly')
        or coalesce(b.is_monthly_billing_booking, false)
        or coalesce(b.amount_paid_cents, 0) > 0
        or coalesce(b.deposit_paid_cents, 0) > 0
        or coalesce(b.total_paid_cents, 0) > 0
        or coalesce(b.total_paid_zar, 0) > 0
        or b.payment_transaction_id is not null
        or b.monthly_invoice_id is not null
        or b.sales_document_id is not null
        or b.payout_id is not null
        or lower(trim(coalesce(b.payout_status, ''))) in ('eligible', 'approved', 'processing', 'paid')
        or coalesce(b.payout_frozen_cents, 0) > 0
        or coalesce(b.display_earnings_cents, 0) > 0
        or coalesce(b.cleaner_payout_cents, 0) > 0
        or coalesce(b.cleaner_bonus_cents, 0) > 0
        or coalesce(b.payout_earnings_cents, 0) > 0
        or coalesce(b.cleaner_earnings_total_cents, 0) > 0
        or coalesce(b.internal_earnings_cents, 0) > 0
        or b.paid_at is not null
      )
  )
  or exists (
    select 1 from public.payment_transactions pt
    where pt.booking_id = p_booking_id
       or (pt.entity_type = 'booking' and pt.entity_id = p_booking_id)
  )
  or exists (select 1 from public.expenses e where e.booking_id = p_booking_id)
  or exists (select 1 from public.inventory_movements im where im.booking_id = p_booking_id)
  or exists (select 1 from public.transport_cost_entries tce where tce.booking_id = p_booking_id)
  or exists (select 1 from public.cleaning_credit_transactions cct where cct.booking_id = p_booking_id)
  or exists (select 1 from public.invoice_adjustments ia where ia.booking_id = p_booking_id)
  or exists (
    select 1 from public.refund_accounting_records rar
    where rar.entity_type = 'booking' and rar.entity_id = p_booking_id
  )
  or exists (select 1 from public.referral_discount_redemptions rdr where rdr.booking_id = p_booking_id)
  or exists (select 1 from public.referral_events re where re.booking_id = p_booking_id)
  or exists (select 1 from public.admin_money_action_proposals amap where amap.booking_id = p_booking_id)
  or exists (
    select 1 from public.accounting_invoice_sync ais
    where ais.booking_id = p_booking_id
       or (ais.entity_type = 'booking' and ais.entity_id = p_booking_id)
  )
  or exists (
    select 1 from public.accounting_sync_records asr
    where asr.entity_type = 'booking' and asr.entity_id = p_booking_id
  )
  or exists (select 1 from public.admin_earnings_actions aea where aea.booking_id = p_booking_id)
  or exists (select 1 from public.booking_changes bc where bc.booking_id = p_booking_id)
  or exists (select 1 from public.growth_action_outcomes gao where gao.booking_id = p_booking_id)
  or exists (select 1 from public.conversion_experiment_results cer where cer.booking_id = p_booking_id)
  or exists (select 1 from public.email_campaign_attributions eca where eca.booking_id = p_booking_id)
  or exists (select 1 from public.booking_cleaner_earnings_snapshot bces where bces.booking_id = p_booking_id)
  or exists (
    select 1 from public.booking_cleaner_earnings_snapshot_lines bcesl
    where bcesl.booking_id = p_booking_id
  )
  or exists (
    select 1
    from public.booking_line_items bli
    where bli.booking_id = p_booking_id
      and coalesce(bli.cleaner_earnings_cents, 0) > 0
  )
  or exists (
    select 1 from public.cleaner_earnings ce
    where ce.booking_id = p_booking_id
  )
  or exists (select 1 from public.cleaner_earnings_adjustments cea where cea.booking_id = p_booking_id)
  or exists (select 1 from public.cleaner_earnings_disputes ced where ced.booking_id = p_booking_id)
  or exists (select 1 from public.team_job_member_payouts tjmp where tjmp.booking_id = p_booking_id)
  or exists (select 1 from public.booking_roster_member_payouts brmp where brmp.booking_id = p_booking_id)
  or exists (
    select 1 from public.payout_audit_events pae
    where p_booking_id = any(coalesce(pae.booking_ids, '{}'::uuid[]))
  );
$financial_history$;

revoke all on function public.booking_has_nonpromotion_financial_history(uuid) from public, anon, authenticated;
grant execute on function public.booking_has_nonpromotion_financial_history(uuid) to service_role;

-- Complete read-only financial-history probe for callers that must mirror the
-- hard-delete trigger exactly. Unlike the purge-specific probe above, promotion
-- redemptions are included here.
create or replace function public.booking_has_financial_history(p_booking_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $full_financial_history$
  select public.booking_has_nonpromotion_financial_history(p_booking_id)
      or exists (
        select 1
        from public.promotion_redemptions pr
        where pr.booking_id = p_booking_id
      );
$full_financial_history$;

revoke all on function public.booking_has_financial_history(uuid) from public, anon, authenticated;
grant execute on function public.booking_has_financial_history(uuid) to service_role;


-- Read-only preflight for governed seed financial reset. This MUST run before
-- the first mutation in scripts/seed-dev.mjs so irreversible/spent referral
-- credit or unprovable promotion revenue cannot leave a partially dismantled
-- seed dataset.
create or replace function public.preflight_seed_financial_reset(
  p_booking_ids uuid[],
  p_seed_recurring_ids uuid[]
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $seed_financial_preflight$
declare
  v_booking record;
  v_tx record;
  v_referral public.referrals%rowtype;
  v_balance numeric;
  v_redemption record;
  v_promotion record;
begin
  for v_booking in
    select id, paystack_reference, recurring_id
      from public.bookings
     where id = any(coalesce(p_booking_ids, '{}'::uuid[]))
  loop
    if coalesce(v_booking.paystack_reference, '') not like 'DEVSEED-%'
       and not (
         v_booking.recurring_id is not null
         and v_booking.recurring_id = any(coalesce(p_seed_recurring_ids, '{}'::uuid[]))
       )
    then
      return jsonb_build_object(
        'ok', false,
        'error', 'not_devseed_booking',
        'booking_id', v_booking.id
      );
    end if;

    for v_tx in
      select id, user_id, referral_id, amount_zar
        from public.cleaning_credit_transactions
       where booking_id = v_booking.id
         and type = 'earn'
         and referral_id is not null
    loop
      select *
        into v_referral
        from public.referrals
       where id = v_tx.referral_id;

      if not found then
        return jsonb_build_object(
          'ok', false,
          'error', 'referral_not_found',
          'booking_id', v_booking.id,
          'referral_id', v_tx.referral_id
        );
      end if;

      if v_referral.status <> 'rewarded' then
        return jsonb_build_object(
          'ok', false,
          'error', 'unexpected_referral_status',
          'booking_id', v_booking.id,
          'referral_id', v_referral.id,
          'status', v_referral.status
        );
      end if;
    end loop;

    for v_redemption in
      select id, metadata
        from public.promotion_redemptions
       where booking_id = v_booking.id
         and status = 'applied'
    loop
      if jsonb_typeof(v_redemption.metadata -> 'bookingRevenueZar') <> 'number' then
        return jsonb_build_object(
          'ok', false,
          'error', 'promotion_original_revenue_unproven',
          'booking_id', v_booking.id,
          'redemption_id', v_redemption.id
        );
      end if;
    end loop;
  end loop;

  -- Check referral reversibility cumulatively per wallet. Individual checks can
  -- miss the case where several seed rewards were partly spent from one balance.
  for v_tx in
    select user_id, sum(greatest(round(coalesce(amount_zar, 0)::numeric, 2), 0)) as amount_zar
      from public.cleaning_credit_transactions
     where booking_id = any(coalesce(p_booking_ids, '{}'::uuid[]))
       and type = 'earn'
       and referral_id is not null
     group by user_id
  loop
    select coalesce(credit_balance_zar, 0)
      into v_balance
      from public.user_profiles
     where id = v_tx.user_id;

    if not found then
      return jsonb_build_object(
        'ok', false,
        'error', 'referrer_profile_not_found',
        'user_id', v_tx.user_id
      );
    end if;

    if v_balance + 0.001 < coalesce(v_tx.amount_zar, 0) then
      return jsonb_build_object(
        'ok', false,
        'error', 'referral_credit_already_spent',
        'user_id', v_tx.user_id,
        'balance_zar', v_balance,
        'required_zar', v_tx.amount_zar
      );
    end if;
  end loop;

  -- Fail closed if shared promotion counters cannot support an exact reversal
  -- of all selected seed redemptions. This avoids greatest(0) masking drift and
  -- protects non-seed analytics on the same promotion.
  for v_promotion in
    select
      pr.promotion_id,
      count(*)::bigint as redemption_count,
      sum(greatest(coalesce(pr.discount_zar, 0), 0))::numeric as discount_zar,
      sum(greatest(coalesce((pr.metadata ->> 'bookingRevenueZar')::numeric, 0), 0))::numeric as revenue_zar
    from public.promotion_redemptions pr
    where pr.booking_id = any(coalesce(p_booking_ids, '{}'::uuid[]))
      and pr.status = 'applied'
      and jsonb_typeof(pr.metadata -> 'bookingRevenueZar') = 'number'
    group by pr.promotion_id
  loop
    if not exists (
      select 1
      from public.promotions p
      where p.id = v_promotion.promotion_id
        and coalesce(p.redemptions_count, 0) >= v_promotion.redemption_count
        and coalesce(p.budget_spent_zar, 0) + 0.001 >= coalesce(v_promotion.discount_zar, 0)
        and coalesce(p.revenue_generated_zar, 0) + 0.001 >= coalesce(v_promotion.revenue_zar, 0)
    ) then
      return jsonb_build_object(
        'ok', false,
        'error', 'promotion_counter_reversal_unproven',
        'promotion_id', v_promotion.promotion_id
      );
    end if;
  end loop;

  return jsonb_build_object('ok', true);
end;
$seed_financial_preflight$;

revoke all on function public.preflight_seed_financial_reset(uuid[], uuid[]) from public, anon, authenticated;
grant execute on function public.preflight_seed_financial_reset(uuid[], uuid[]) to service_role;


-- Governed non-production seed referral-reward reversal. It removes only an
-- earn transaction tied to a known seed booking, restores the wallet balance,
-- and returns the referral to pending in one transaction. The helper fails
-- closed if the reward has already been spent or the referral state is not the
-- expected rewarded state.
create or replace function public.reset_seed_referral_credit_for_booking(
  p_booking_id uuid,
  p_seed_recurring_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $seed_referral_reset$
declare
  v_booking_reference text;
  v_recurring_id uuid;
  v_tx record;
  v_referral public.referrals%rowtype;
  v_balance numeric;
  v_amount numeric;
  v_reversed integer := 0;
begin
  select paystack_reference, recurring_id
    into v_booking_reference, v_recurring_id
    from public.bookings
   where id = p_booking_id
   for update;

  if not found
     or (
       coalesce(v_booking_reference, '') not like 'DEVSEED-%'
       and not (v_recurring_id is not null and v_recurring_id = any(coalesce(p_seed_recurring_ids, '{}'::uuid[])))
     )
  then
    return jsonb_build_object('ok', false, 'error', 'not_devseed_booking');
  end if;

  for v_tx in
    select id, user_id, referral_id, amount_zar
      from public.cleaning_credit_transactions
     where booking_id = p_booking_id
       and type = 'earn'
       and referral_id is not null
     for update
  loop
    select *
      into v_referral
      from public.referrals
     where id = v_tx.referral_id
     for update;

    if not found then
      return jsonb_build_object('ok', false, 'error', 'referral_not_found', 'referral_id', v_tx.referral_id);
    end if;

    if v_referral.status <> 'rewarded' then
      return jsonb_build_object(
        'ok', false,
        'error', 'unexpected_referral_status',
        'referral_id', v_referral.id,
        'status', v_referral.status
      );
    end if;

    v_amount := greatest(round(coalesce(v_tx.amount_zar, 0)::numeric, 2), 0);

    select coalesce(credit_balance_zar, 0)
      into v_balance
      from public.user_profiles
     where id = v_tx.user_id
     for update;

    if not found then
      return jsonb_build_object('ok', false, 'error', 'referrer_profile_not_found', 'user_id', v_tx.user_id);
    end if;

    if v_balance + 0.001 < v_amount then
      return jsonb_build_object(
        'ok', false,
        'error', 'referral_credit_already_spent',
        'referral_id', v_referral.id,
        'balance_zar', v_balance,
        'required_zar', v_amount
      );
    end if;

    update public.user_profiles
       set credit_balance_zar = round((v_balance - v_amount) * 100) / 100
     where id = v_tx.user_id;

    update public.referrals
       set status = 'pending',
           completed_at = null,
           rewarded_at = null,
           credit_expires_at = null,
           admin_notes = 'DEV SEED RESET: referral reward reversed'
     where id = v_referral.id
       and status = 'rewarded';

    if not found then
      raise exception 'seed_referral_state_changed';
    end if;

    delete from public.cleaning_credit_transactions
     where id = v_tx.id
       and type = 'earn';

    v_reversed := v_reversed + 1;
  end loop;

  return jsonb_build_object('ok', true, 'reversed', v_reversed);
end;
$seed_referral_reset$;

revoke all on function public.reset_seed_referral_credit_for_booking(uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.reset_seed_referral_credit_for_booking(uuid, uuid[]) to service_role;


-- Governed non-production seed promotion reversal. Applied redemption counters
-- are reconciled using the original revenue captured in redemption metadata,
-- never the booking's mutable current total. Setting each row to reversed first
-- makes retries idempotent.
create or replace function public.reset_seed_promotion_redemptions_for_booking(
  p_booking_id uuid,
  p_seed_recurring_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $seed_promotion_reset$
declare
  v_booking_reference text;
  v_recurring_id uuid;
  v_redemption record;
  v_original_revenue_zar numeric;
  v_reversed integer := 0;
begin
  select paystack_reference, recurring_id
    into v_booking_reference, v_recurring_id
    from public.bookings
   where id = p_booking_id
   for update;

  if not found
     or (
       coalesce(v_booking_reference, '') not like 'DEVSEED-%'
       and not (v_recurring_id is not null and v_recurring_id = any(coalesce(p_seed_recurring_ids, '{}'::uuid[])))
     )
  then
    return jsonb_build_object('ok', false, 'error', 'not_devseed_booking');
  end if;

  for v_redemption in
    select id, promotion_id, discount_zar, metadata
      from public.promotion_redemptions
     where booking_id = p_booking_id
       and status = 'applied'
     for update
  loop
    if jsonb_typeof(v_redemption.metadata -> 'bookingRevenueZar') <> 'number' then
      return jsonb_build_object(
        'ok', false,
        'error', 'promotion_original_revenue_unproven',
        'redemption_id', v_redemption.id
      );
    end if;

    v_original_revenue_zar := greatest(
      coalesce((v_redemption.metadata ->> 'bookingRevenueZar')::numeric, 0),
      0
    );

    update public.promotion_redemptions
       set status = 'reversed'
     where id = v_redemption.id
       and status = 'applied';

    if found then
      update public.promotions
         set redemptions_count = greatest(0, coalesce(redemptions_count, 0) - 1),
             budget_spent_zar = greatest(
               0,
               coalesce(budget_spent_zar, 0) - greatest(coalesce(v_redemption.discount_zar, 0), 0)
             ),
             revenue_generated_zar = greatest(
               0,
               coalesce(revenue_generated_zar, 0) - v_original_revenue_zar
             ),
             updated_at = now()
       where id = v_redemption.promotion_id;

      v_reversed := v_reversed + 1;
    end if;
  end loop;

  return jsonb_build_object('ok', true, 'reversed', v_reversed);
end;
$seed_promotion_reset$;

revoke all on function public.reset_seed_promotion_redemptions_for_booking(uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.reset_seed_promotion_redemptions_for_booking(uuid, uuid[]) to service_role;


-- Governed non-production seed-reset helper. It is idempotent because the
-- reservation status is changed to released in the same transaction as any
-- balance restoration. It is additionally scoped to DEVSEED booking references.
create or replace function public.reset_seed_cleaning_credit_for_booking(
  p_booking_id uuid,
  p_seed_recurring_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $seed_credit_reset$
declare
  v_booking_reference text;
  v_recurring_id uuid;
  v public.cleaning_credit_reservations%rowtype;
  v_balance numeric;
  v_after numeric;
begin
  select paystack_reference, recurring_id
    into v_booking_reference, v_recurring_id
    from public.bookings
   where id = p_booking_id
   for update;

  if not found
     or (
       coalesce(v_booking_reference, '') not like 'DEVSEED-%'
       and not (v_recurring_id is not null and v_recurring_id = any(coalesce(p_seed_recurring_ids, '{}'::uuid[])))
     )
  then
    return jsonb_build_object('ok', false, 'error', 'not_devseed_booking');
  end if;

  select *
    into v
    from public.cleaning_credit_reservations
   where booking_id = p_booking_id
   for update;

  if not found then
    return jsonb_build_object('ok', true, 'status', 'reservation_not_found');
  end if;

  if v.status = 'released' then
    return jsonb_build_object('ok', true, 'status', 'already_released');
  end if;

  if v.status not in ('reserved', 'settled') then
    return jsonb_build_object('ok', false, 'error', 'unsupported_reservation_status', 'status', v.status);
  end if;

  select coalesce(credit_balance_zar, 0)
    into v_balance
    from public.user_profiles
   where id = v.user_id
   for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'user_not_found');
  end if;

  v_after := round((v_balance + v.amount_zar) * 100) / 100;

  update public.user_profiles
     set credit_balance_zar = v_after
   where id = v.user_id;

  if v.status = 'settled' then
    insert into public.cleaning_credit_transactions(
      user_id,
      amount_zar,
      balance_after_zar,
      type,
      booking_id,
      note,
      created_by
    )
    values (
      v.user_id,
      v.amount_zar,
      v_after,
      'admin_adjust',
      v.booking_id,
      'DEV SEED RESET: restore settled Cleaning Credit',
      'seed-dev-reset'
    );
  end if;

  update public.cleaning_credit_reservations
     set status = 'released',
         released_at = coalesce(released_at, now()),
         updated_at = now()
   where id = v.id;

  return jsonb_build_object('ok', true, 'status', 'released', 'balance_after_zar', v_after);
end;
$seed_credit_reset$;

revoke all on function public.reset_seed_cleaning_credit_for_booking(uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.reset_seed_cleaning_credit_for_booking(uuid, uuid[]) to service_role;


-- Governed non-production seed-reset inventory helper. The original movement
-- and stock quantity are reconciled in one transaction, making retries idempotent.
create or replace function public.reset_seed_inventory_movement(
  p_movement_id uuid,
  p_seed_recurring_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $seed_inventory_reset$
declare
  v_movement public.inventory_movements%rowtype;
  v_booking_reference text;
  v_recurring_id uuid;
begin
  select *
    into v_movement
    from public.inventory_movements
   where id = p_movement_id
   for update;

  if not found then
    return jsonb_build_object('ok', true, 'status', 'already_removed');
  end if;

  if v_movement.booking_id is null then
    return jsonb_build_object('ok', false, 'error', 'movement_not_booking_scoped');
  end if;

  select paystack_reference, recurring_id
    into v_booking_reference, v_recurring_id
    from public.bookings
   where id = v_movement.booking_id
   for update;

  if not found
     or (
       coalesce(v_booking_reference, '') not like 'DEVSEED-%'
       and not (v_recurring_id is not null and v_recurring_id = any(coalesce(p_seed_recurring_ids, '{}'::uuid[])))
     )
  then
    return jsonb_build_object('ok', false, 'error', 'not_devseed_booking');
  end if;

  perform 1
    from public.inventory_items
   where id = v_movement.item_id
   for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'inventory_item_not_found');
  end if;

  update public.inventory_items
     set quantity_on_hand = quantity_on_hand - v_movement.quantity_delta,
         updated_at = now()
   where id = v_movement.item_id;

  delete from public.inventory_movements where id = v_movement.id;

  return jsonb_build_object('ok', true, 'status', 'reversed_and_removed');
end;
$seed_inventory_reset$;

revoke all on function public.reset_seed_inventory_movement(uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.reset_seed_inventory_movement(uuid, uuid[]) to service_role;

-- Keep the pending-payment purge healthy after adding the delete guard.
-- Process candidates independently so one protected financial row cannot roll
-- back deletion of unrelated abandoned checkout rows.
create or replace function public.purge_stale_pending_payment_bookings()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted bigint := 0;
  v_recurring_protected bigint := 0;
  v_financially_protected bigint := 0;
  v_fk_protected bigint := 0;
  v_promotions_reversed bigint := 0;
  r record;
  v_redemption record;
  v_booking_revenue_zar numeric;
  v_promotion_revenue_unproven boolean;
  v_status text;
  v_created_at timestamptz;
  v_is_recurring boolean;
  v_total_price numeric;
begin
  select count(*)
    into v_recurring_protected
  from public.bookings
  where status = 'pending_payment'
    and created_at < now() - interval '2 hours'
    and coalesce(is_recurring_generated, false) = true;

  for r in
    select id, total_price
    from public.bookings
    where status = 'pending_payment'
      and created_at < now() - interval '2 hours'
      and coalesce(is_recurring_generated, false) = false
    order by created_at, id
  loop
    begin
      select status, created_at, coalesce(is_recurring_generated, false), total_price
        into v_status, v_created_at, v_is_recurring, v_total_price
        from public.bookings
       where id = r.id
       for update;

      if not found
         or v_status is distinct from 'pending_payment'
         or v_created_at >= now() - interval '2 hours'
         or v_is_recurring
      then
        continue;
      end if;

      if public.booking_has_nonpromotion_financial_history(r.id) then
        v_financially_protected := v_financially_protected + 1;
        continue;
      end if;

      -- Applied promotions are financial eligibility state, not disposable checkout
      -- metadata. Reverse the abandoned checkout atomically and retain the booking
      -- as payment_expired so redemption attribution remains auditable.
      if exists (
        select 1
        from public.promotion_redemptions pr
        where pr.booking_id = r.id
          and pr.status = 'applied'
      ) then
        v_promotion_revenue_unproven := false;

        for v_redemption in
          select id, promotion_id, discount_zar, metadata
          from public.promotion_redemptions
          where booking_id = r.id
            and status = 'applied'
          for update
        loop
          if jsonb_typeof(v_redemption.metadata -> 'bookingRevenueZar') <> 'number' then
            v_promotion_revenue_unproven := true;
            exit;
          end if;

          v_booking_revenue_zar := greatest(
            coalesce((v_redemption.metadata ->> 'bookingRevenueZar')::numeric, 0),
            0
          );

          update public.promotion_redemptions
             set status = 'reversed'
           where id = v_redemption.id
             and status = 'applied';

          if found then
            update public.promotions
               set redemptions_count = greatest(0, coalesce(redemptions_count, 0) - 1),
                   budget_spent_zar = greatest(0, coalesce(budget_spent_zar, 0) - greatest(coalesce(v_redemption.discount_zar, 0), 0)),
                   revenue_generated_zar = greatest(0, coalesce(revenue_generated_zar, 0) - v_booking_revenue_zar),
                   updated_at = now()
             where id = v_redemption.promotion_id;

            v_promotions_reversed := v_promotions_reversed + 1;
          end if;
        end loop;

        if v_promotion_revenue_unproven then
          -- Legacy redemption without original revenue evidence: retain the
          -- booking/redemption untouched rather than corrupt shared counters.
          v_financially_protected := v_financially_protected + 1;
          continue;
        end if;

        update public.bookings
           set status = 'payment_expired'
         where id = r.id
           and status = 'pending_payment'
           and created_at < now() - interval '2 hours'
           and coalesce(is_recurring_generated, false) = false;

        v_financially_protected := v_financially_protected + 1;
        continue;
      end if;

      delete from public.bookings
       where id = r.id
         and status = 'pending_payment'
         and created_at < now() - interval '2 hours'
         and coalesce(is_recurring_generated, false) = false;
      if found then
        v_deleted := v_deleted + 1;
      end if;
    exception
      when check_violation then
        if sqlerrm = 'booking_delete_blocked_financial_history' then
          v_financially_protected := v_financially_protected + 1;
        else
          raise;
        end if;
      when foreign_key_violation then
        -- Existing RESTRICT children (for example Cleaning Credit reservations
        -- or recurring-prepayment package/allocation rows) protect their booking.
        -- Count and continue so one protected checkout cannot roll back the batch.
        v_fk_protected := v_fk_protected + 1;
    end;
  end loop;

  raise log 'purge_stale_pending_payment_bookings: purged % checkout rows, protected % recurring rows, protected % financial rows, protected % FK rows, reversed % promotions',
    v_deleted, v_recurring_protected, v_financially_protected, v_fk_protected, v_promotions_reversed;

  insert into public.dispatch_logs (source, level, message, context)
  values (
    'purge_stale_pending_payment_bookings',
    'info',
    'purged stale pending_payment checkout bookings',
    jsonb_build_object(
      'deleted', v_deleted,
      'recurring_protected', v_recurring_protected,
      'financially_protected', v_financially_protected,
      'fk_protected', v_fk_protected,
      'promotions_reversed', v_promotions_reversed
    )
  );

  return jsonb_build_object(
    'ok', true,
    'deleted', v_deleted,
    'recurring_protected', v_recurring_protected,
    'financially_protected', v_financially_protected,
    'fk_protected', v_fk_protected,
    'promotions_reversed', v_promotions_reversed,
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

revoke all on function public.purge_stale_pending_payment_bookings() from public, anon, authenticated;
grant execute on function public.purge_stale_pending_payment_bookings() to service_role;


-- The financial hard-delete guard makes monthly duplicate cleanup retention-safe:
-- losing duplicate rows are cancelled, not deleted. The payload keeps the legacy
-- deleted_ids key for caller compatibility; those IDs are now cancelled losers.
create or replace function public.resolve_admin_monthly_booking_race(
  p_our_id uuid,
  p_user_id uuid,
  p_date text,
  p_time text,
  p_service_slug text,
  p_force boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_slug text := lower(trim(p_service_slug));
  v_t0 timestamptz;
  v_t1 timestamptz;
  v_winner uuid;
  v_winner_created timestamptz;
  v_deleted uuid[] := '{}';
  r_id uuid;
  v_json_deleted jsonb;
  v_active_count int;
  v_our_exists boolean;
  v_cluster_size int;
begin
  if p_force then
    return jsonb_build_object(
      'action', 'proceed',
      'ok', true,
      'winner_id', null,
      'deleted_ids', '[]'::jsonb,
      'cluster_start', null,
      'cluster_end', null,
      'cluster_size', null,
      'winner_created_at', null,
      'left_duplicate', false,
      'rolled_back_self', false
    );
  end if;

  perform 1
  from public.bookings b
  where public.booking_matches_active_admin_slot(b, p_user_id, p_date, p_time, v_slug)
  for update;

  select exists(select 1 from public.bookings b where b.id = p_our_id) into v_our_exists;

  select count(*)::int into v_active_count
  from public.bookings b
  where public.booking_matches_active_admin_slot(b, p_user_id, p_date, p_time, v_slug);

  if v_active_count = 0 then
    if v_our_exists then
      return jsonb_build_object(
        'action', 'reject',
        'ok', false,
        'winner_id', null,
        'deleted_ids', '[]'::jsonb,
        'cluster_start', null,
        'cluster_end', null,
        'cluster_size', 0,
        'winner_created_at', null,
        'left_duplicate', false,
        'rolled_back_self', true
      );
    end if;

    return jsonb_build_object(
      'action', 'proceed',
      'ok', true,
      'winner_id', null,
      'deleted_ids', '[]'::jsonb,
      'cluster_start', null,
      'cluster_end', null,
      'cluster_size', 0,
      'winner_created_at', null,
      'left_duplicate', false,
      'rolled_back_self', false
    );
  end if;

  if not v_our_exists then
    select min(b.created_at) into v_t0
    from public.bookings b
    where public.booking_matches_active_admin_slot(b, p_user_id, p_date, p_time, v_slug);

    if v_t0 is null then
      return jsonb_build_object(
        'action', 'reject',
        'ok', false,
        'winner_id', null,
        'deleted_ids', '[]'::jsonb,
        'cluster_start', null,
        'cluster_end', null,
        'cluster_size', v_active_count,
        'winner_created_at', null,
        'left_duplicate', false,
        'rolled_back_self', true
      );
    end if;

    v_t1 := v_t0 + interval '2 seconds';

    select count(*)::int into v_cluster_size
    from public.bookings b
    where public.booking_matches_active_admin_slot(b, p_user_id, p_date, p_time, v_slug)
      and b.created_at >= v_t0
      and b.created_at <= v_t1;

    select b.id, b.created_at into v_winner, v_winner_created
    from public.bookings b
    where public.booking_matches_active_admin_slot(b, p_user_id, p_date, p_time, v_slug)
      and b.created_at >= v_t0
      and b.created_at <= v_t1
      and b.monthly_invoice_id is not null
      and exists (
        select 1 from public.monthly_invoices mi
        where mi.id = b.monthly_invoice_id and lower(mi.status) is distinct from 'draft'
      )
    order by b.created_at asc, b.id asc
    limit 1;

    if v_winner is null then
      select b.id, b.created_at into v_winner, v_winner_created
      from public.bookings b
      where public.booking_matches_active_admin_slot(b, p_user_id, p_date, p_time, v_slug)
        and b.created_at >= v_t0
        and b.created_at <= v_t1
      order by b.created_at asc, b.id asc
      limit 1;
    end if;

    return jsonb_build_object(
      'action', 'reject',
      'ok', false,
      'winner_id', v_winner,
      'deleted_ids', '[]'::jsonb,
      'cluster_start', v_t0,
      'cluster_end', v_t1,
      'cluster_size', v_cluster_size,
      'winner_created_at', v_winner_created,
      'left_duplicate', false,
      'rolled_back_self', true
    );
  end if;

  if v_active_count = 1 then
    select b.id, b.created_at into v_winner, v_winner_created
    from public.bookings b
    where public.booking_matches_active_admin_slot(b, p_user_id, p_date, p_time, v_slug)
    order by b.created_at asc, b.id asc
    limit 1;

    v_t0 := v_winner_created;
    v_t1 := coalesce(v_winner_created, now()) + interval '2 seconds';

    if p_our_id is distinct from v_winner then
      return jsonb_build_object(
        'action', 'reject',
        'ok', false,
        'winner_id', v_winner,
        'deleted_ids', '[]'::jsonb,
        'cluster_start', v_t0,
        'cluster_end', v_t1,
        'cluster_size', 1,
        'winner_created_at', v_winner_created,
        'left_duplicate', false,
        'rolled_back_self', true
      );
    end if;

    return jsonb_build_object(
      'action', 'proceed',
      'ok', true,
      'winner_id', v_winner,
      'deleted_ids', '[]'::jsonb,
      'cluster_start', v_t0,
      'cluster_end', v_t1,
      'cluster_size', 1,
      'winner_created_at', v_winner_created,
      'left_duplicate', false,
      'rolled_back_self', false
    );
  end if;

  select min(b.created_at) into v_t0
  from public.bookings b
  where public.booking_matches_active_admin_slot(b, p_user_id, p_date, p_time, v_slug);

  if v_t0 is null then
    return jsonb_build_object(
      'action', 'proceed',
      'ok', true,
      'winner_id', null,
      'deleted_ids', '[]'::jsonb,
      'cluster_start', null,
      'cluster_end', null,
      'cluster_size', 0,
      'winner_created_at', null,
      'left_duplicate', false,
      'rolled_back_self', false
    );
  end if;

  v_t1 := v_t0 + interval '2 seconds';

  select count(*)::int into v_cluster_size
  from public.bookings b
  where public.booking_matches_active_admin_slot(b, p_user_id, p_date, p_time, v_slug)
    and b.created_at >= v_t0
    and b.created_at <= v_t1;

  select b.id, b.created_at into v_winner, v_winner_created
  from public.bookings b
  where public.booking_matches_active_admin_slot(b, p_user_id, p_date, p_time, v_slug)
    and b.created_at >= v_t0
    and b.created_at <= v_t1
    and b.monthly_invoice_id is not null
    and exists (
      select 1 from public.monthly_invoices mi
      where mi.id = b.monthly_invoice_id and lower(mi.status) is distinct from 'draft'
    )
  order by b.created_at asc, b.id asc
  limit 1;

  if v_winner is null then
    select b.id, b.created_at into v_winner, v_winner_created
    from public.bookings b
    where public.booking_matches_active_admin_slot(b, p_user_id, p_date, p_time, v_slug)
      and b.created_at >= v_t0
      and b.created_at <= v_t1
    order by b.created_at asc, b.id asc
    limit 1;
  end if;

  if v_winner is null then
    return jsonb_build_object(
      'action', 'proceed',
      'ok', true,
      'winner_id', null,
      'deleted_ids', '[]'::jsonb,
      'cluster_start', v_t0,
      'cluster_end', v_t1,
      'cluster_size', v_cluster_size,
      'winner_created_at', null,
      'left_duplicate', false,
      'rolled_back_self', false
    );
  end if;

  for r_id in
    select b.id
    from public.bookings b
    where public.booking_matches_active_admin_slot(b, p_user_id, p_date, p_time, v_slug)
      and b.created_at >= v_t0
      and b.created_at <= v_t1
      and b.id <> v_winner
    order by b.created_at asc, b.id asc
  loop
    if exists (
      select 1 from public.bookings b
      where b.id = r_id
        and (
          b.payment_status is null
          or b.payment_status in ('pending', 'pending_monthly')
        )
        and (
          b.monthly_invoice_id is null
          or exists (
            select 1 from public.monthly_invoices mi
            where mi.id = b.monthly_invoice_id and lower(mi.status) = 'draft'
          )
        )
    ) then
      update public.bookings
         set status = 'cancelled',
             updated_at = now()
       where id = r_id;
      if found then
        v_deleted := array_append(v_deleted, r_id);
      end if;
    end if;
  end loop;

  select coalesce(jsonb_agg(x::text), '[]'::jsonb) into v_json_deleted from unnest(v_deleted) as x;

  if p_our_id = any(v_deleted) then
    return jsonb_build_object(
      'action', 'reject',
      'ok', false,
      'winner_id', v_winner,
      'deleted_ids', v_json_deleted,
      'cluster_start', v_t0,
      'cluster_end', v_t1,
      'cluster_size', v_cluster_size,
      'winner_created_at', v_winner_created,
      'left_duplicate', false,
      'rolled_back_self', true
    );
  end if;

  if p_our_id is distinct from v_winner then
    return jsonb_build_object(
      'action', 'reject',
      'ok', false,
      'winner_id', v_winner,
      'deleted_ids', v_json_deleted,
      'cluster_start', v_t0,
      'cluster_end', v_t1,
      'cluster_size', v_cluster_size,
      'winner_created_at', v_winner_created,
      'left_duplicate', true,
      'rolled_back_self', false
    );
  end if;

  return jsonb_build_object(
    'action', 'proceed',
    'ok', true,
    'winner_id', v_winner,
    'deleted_ids', v_json_deleted,
    'cluster_start', v_t0,
    'cluster_end', v_t1,
    'cluster_size', v_cluster_size,
    'winner_created_at', v_winner_created,
    'left_duplicate', false,
    'rolled_back_self', false
  );
end;
$fn$;


comment on function public.resolve_admin_monthly_booking_race(uuid, uuid, text, text, text, boolean) is
  'AUDIT-02A04: serializes monthly duplicate races and cancels invoice-safe losers instead of hard deleting financial-flow rows.';

-- Guarded rollback for a provisional recurring-prepaid occurrence whose allocation
-- claim failed. This removes only an unclaimed reserved allocation booking. The
-- recurring-prepayment tables are intentionally accessed dynamically because older
-- production schemas may not have that feature installed yet.
create or replace function public.rollback_unclaimed_recurring_prepaid_booking(
  p_booking_id uuid,
  p_allocation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.bookings%rowtype;
  v_alloc_status text;
  v_alloc_booking_id uuid;
begin
  select *
    into v
    from public.bookings
   where id = p_booking_id
   for update;

  if not found then
    return jsonb_build_object('ok', true, 'already_absent', true);
  end if;

  if p_allocation_id is null
     or v.recurring_id is null
     or coalesce(v.paystack_reference, '') <> ('rpp_' || p_allocation_id::text)
  then
    return jsonb_build_object('ok', false, 'error', 'provisional_booking_identity_mismatch');
  end if;

  if to_regclass('public.recurring_prepaid_allocations') is null then
    return jsonb_build_object('ok', false, 'error', 'recurring_prepaid_allocations_missing');
  end if;

  execute
    'select status, booking_id
       from public.recurring_prepaid_allocations
      where id = $1
      for update'
    into v_alloc_status, v_alloc_booking_id
    using p_allocation_id;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'allocation_not_found');
  end if;

  if coalesce(v_alloc_status, '') <> 'reserved' or v_alloc_booking_id is not null then
    return jsonb_build_object('ok', false, 'error', 'allocation_not_unclaimed');
  end if;

  -- Neutralize only provisional settlement mirrors before invoking the normal
  -- hard-delete guard. Any durable child financial history still blocks DELETE.
  update public.bookings
     set status = 'payment_expired',
         payment_status = 'pending',
         payment_completed_at = null,
         amount_paid_cents = 0,
         total_paid_cents = 0,
         total_paid_zar = 0,
         updated_at = now()
   where id = p_booking_id;

  delete from public.bookings where id = p_booking_id;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'provisional_booking_delete_failed');
  end if;

  return jsonb_build_object('ok', true, 'already_absent', false);
exception
  when check_violation or foreign_key_violation then
    return jsonb_build_object('ok', false, 'error', sqlerrm, 'sqlstate', sqlstate);
end;
$$;

revoke all on function public.rollback_unclaimed_recurring_prepaid_booking(uuid, uuid) from public, anon, authenticated;
grant execute on function public.rollback_unclaimed_recurring_prepaid_booking(uuid, uuid) to service_role;
