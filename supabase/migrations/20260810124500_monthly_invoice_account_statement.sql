-- Customer account statement projection for monthly invoices.
-- Keeps each monthly invoice as its own accounting document while exposing
-- the combined open balance needed for statement-level collection.

create or replace view public.monthly_invoice_customer_statement
with (security_invoker = true)
as
select
  mi.customer_id,
  mi.id as invoice_id,
  mi.month,
  mi.status,
  mi.invoice_date,
  mi.due_date,
  mi.original_due_date,
  mi.payment_arrangement_active,
  mi.promised_payment_date,
  mi.payment_arrangement_note,
  mi.total_amount_cents,
  mi.amount_paid_cents,
  mi.balance_cents,
  mi.zoho_invoice_id,
  mi.zoho_invoice_number,
  sum(greatest(coalesce(mi.balance_cents, 0), 0)) over (partition by mi.customer_id) as account_open_balance_cents,
  sum(
    case
      when mi.payment_arrangement_active then greatest(coalesce(mi.balance_cents, 0), 0)
      else 0
    end
  ) over (partition by mi.customer_id) as arranged_balance_cents
from public.monthly_invoices mi
where coalesce(mi.is_closed, false) = false
  and lower(coalesce(mi.status, '')) in ('sent', 'partially_paid', 'overdue', 'draft')
  and greatest(coalesce(mi.balance_cents, 0), 0) > 0;

comment on view public.monthly_invoice_customer_statement is
  'Open monthly invoice statement projection. Monthly invoices remain separate; account_open_balance_cents is the combined receivable for statement-level collection.';

grant select on public.monthly_invoice_customer_statement to service_role;
revoke all on public.monthly_invoice_customer_statement from anon, authenticated;
