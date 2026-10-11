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
  if old.payment_completed_at is not null
     or lower(trim(coalesce(old.payment_status, ''))) in ('paid', 'success', 'succeeded')
     or coalesce(old.amount_paid_cents, 0) > 0
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
