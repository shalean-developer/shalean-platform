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
