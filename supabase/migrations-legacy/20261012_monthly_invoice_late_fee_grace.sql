-- Late fee category + 5-day payment grace before overdue flag.

alter table public.invoice_adjustments
  drop constraint if exists invoice_adjustments_category_check;

alter table public.invoice_adjustments
  add constraint invoice_adjustments_category_check
  check (category in ('missed_visit', 'extra_service', 'discount', 'late_fee', 'other'));

comment on column public.invoice_adjustments.category is
  'Preset classification: missed_visit, extra_service, discount, late_fee, other.';

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
    is_overdue = true,
    updated_at = now()
  where (due_date + v_grace) < p_today
    and status in ('sent', 'partially_paid')
    and coalesce(total_amount_cents, 0) > coalesce(amount_paid_cents, 0);

  get diagnostics v_n = row_count;

  update public.monthly_invoices
  set
    is_overdue = false,
    updated_at = now()
  where is_overdue = true
    and coalesce(total_amount_cents, 0) <= coalesce(amount_paid_cents, 0);

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
  'Marks sent/partially_paid invoices overdue when due_date + 5 grace days < p_today.';
