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
  if old.marked_paid_by_admin_id is not null
     or old.zoho_invoice_id is not null
     or old.refunded_at is not null
     or nullif(trim(coalesce(old.refund_status, '')), '') is not null
     or old.payout_paid_at is not null
     or old.payout_run_id is not null
     or old.payment_completed_at is not null
     or lower(trim(coalesce(old.payment_status, ''))) in ('paid', 'success', 'succeeded', 'pending_monthly')
     or coalesce(old.is_monthly_billing_booking, false)
     or coalesce(old.amount_paid_cents, 0) > 0
     or coalesce(old.total_paid_cents, 0) > 0
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
       from public.cleaner_earnings ce
       where ce.booking_id = old.id
         and lower(trim(coalesce(ce.status, ''))) in ('approved', 'processing', 'paid')
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

  if v.payment_completed_at is not null
     or lower(trim(coalesce(v.payment_status, ''))) in ('paid', 'success', 'succeeded')
     or coalesce(v.amount_paid_cents, 0) > 0
     or coalesce(v.total_paid_cents, 0) > 0
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

      -- Applied promotions are financial eligibility state, not disposable checkout
      -- metadata. Reverse the abandoned checkout atomically and retain the booking
      -- as payment_expired so redemption attribution remains auditable.
      if exists (
        select 1
        from public.promotion_redemptions pr
        where pr.booking_id = r.id
          and pr.status = 'applied'
      ) then
        v_booking_revenue_zar := greatest(coalesce(v_total_price, 0), 0);

        for v_redemption in
          select id, promotion_id, discount_zar
          from public.promotion_redemptions
          where booking_id = r.id
            and status = 'applied'
          for update
        loop
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
