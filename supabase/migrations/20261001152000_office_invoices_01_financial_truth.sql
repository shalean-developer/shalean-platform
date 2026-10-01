-- OFFICE-INVOICES-01 — financial truth convergence.
--
-- 1) Recompute overdue flags from the canonical 5-calendar-day grace rule on
--    every run, including clearing stale flags when a due date/payment
--    arrangement changes.
-- 2) Close the one known historical zero-value invoice that remained "sent".
--
-- No customer messaging, Paystack, or Zoho mutation is performed.

create or replace function public.mark_monthly_invoice_overdue_flags(p_today date)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n integer := 0;
  v_grace integer := 5;
begin
  update public.monthly_invoices
  set
    is_overdue = ((due_date + v_grace) < p_today),
    updated_at = now()
  where status in ('sent', 'partially_paid')
    and coalesce(total_amount_cents, 0) > coalesce(amount_paid_cents, 0)
    and is_overdue is distinct from ((due_date + v_grace) < p_today);

  get diagnostics v_n = row_count;

  update public.monthly_invoices
  set
    is_overdue = false,
    updated_at = now()
  where is_overdue = true
    and (
      status not in ('sent', 'partially_paid')
      or coalesce(total_amount_cents, 0) <= coalesce(amount_paid_cents, 0)
    );

  update public.user_profiles up
  set account_billing_risk = 'at_risk', updated_at = now()
  where exists (
    select 1
    from public.monthly_invoices mi
    where mi.customer_id = up.id
      and mi.is_overdue = true
      and coalesce(mi.total_amount_cents, 0) > coalesce(mi.amount_paid_cents, 0)
  );

  update public.user_profiles up
  set account_billing_risk = 'ok', updated_at = now()
  where up.account_billing_risk = 'at_risk'
    and not exists (
      select 1
      from public.monthly_invoices mi
      where mi.customer_id = up.id
        and mi.is_overdue = true
        and coalesce(mi.total_amount_cents, 0) > coalesce(mi.amount_paid_cents, 0)
    );

  return v_n;
end;
$$;

grant execute on function public.mark_monthly_invoice_overdue_flags(date) to service_role;

comment on function public.mark_monthly_invoice_overdue_flags(date) is
  'Recomputes sent/partially_paid invoice overdue flags from due_date + 5 grace days and clears stale flags.';

update public.monthly_invoices
set
  status = 'paid',
  amount_paid_cents = 0,
  is_overdue = false,
  is_closed = true,
  closure_reason = coalesce(closure_reason, 'zero_amount'),
  updated_at = now()
where id = '5074d97f-e6b5-4c03-936b-2ce7e13734e5'::uuid
  and status = 'sent'
  and coalesce(total_amount_cents, 0) = 0
  and coalesce(amount_paid_cents, 0) = 0
  and coalesce(balance_cents, 0) = 0;
