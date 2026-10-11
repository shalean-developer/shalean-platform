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
     or old.payment_completed_at is not null
     or lower(trim(coalesce(old.payment_status, ''))) in ('paid', 'success', 'succeeded')
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
     or old.monthly_invoice_id is not null
     or old.sales_document_id is not null
     or old.payout_id is not null
     or lower(trim(coalesce(old.payout_status, ''))) in ('eligible', 'approved', 'processing', 'paid')
     or coalesce(old.payout_frozen_cents, 0) > 0
     or coalesce(old.display_earnings_cents, 0) > 0
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
      -- Applied promotions are financial eligibility state, not disposable checkout
      -- metadata. Reverse the abandoned checkout atomically and retain the booking
      -- as payment_expired so redemption attribution remains auditable.
      if exists (
        select 1
        from public.promotion_redemptions pr
        where pr.booking_id = r.id
          and pr.status = 'applied'
      ) then
        v_booking_revenue_zar := greatest(coalesce(r.total_price, 0), 0);

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
