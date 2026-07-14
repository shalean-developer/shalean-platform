-- Ops visibility: count automated payment reminders per invoice (incremented by reminder cron).

alter table public.monthly_invoices
  add column if not exists reminder_count integer not null default 0 check (reminder_count >= 0);

comment on column public.monthly_invoices.reminder_count is
  'Number of reminder deliveries recorded by cron (email/whatsapp); unpaid lifecycle uses status sent/partially_paid/overdue + sent_at + balance_cents.';

create or replace function public.increment_monthly_invoice_reminder_count(p_invoice_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.monthly_invoices
  set
    reminder_count = reminder_count + 1,
    updated_at = now()
  where id = p_invoice_id;
end;
$$;

comment on function public.increment_monthly_invoice_reminder_count(uuid) is
  'Atomic bump for monthly_invoices.reminder_count after a reminder channel succeeds (service_role only).';

grant execute on function public.increment_monthly_invoice_reminder_count(uuid) to service_role;
