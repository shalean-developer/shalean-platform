-- Monthly invoice payment arrangements / promise-to-pay support.
--
-- Goals:
-- 1. Preserve the invoice's original contractual due date.
-- 2. Allow an agreed later payment date without marking the invoice paid.
-- 3. Suppress normal overdue treatment/reminders until the agreed date by
--    making the agreed date the operational due_date used by existing code.
-- 4. Keep an audit trail on monthly_invoice_events.

alter table public.monthly_invoices
  add column if not exists original_due_date date,
  add column if not exists payment_arrangement_active boolean not null default false,
  add column if not exists promised_payment_date date,
  add column if not exists payment_arrangement_note text,
  add column if not exists payment_arrangement_created_at timestamptz,
  add column if not exists payment_arrangement_updated_at timestamptz;

update public.monthly_invoices
set original_due_date = due_date
where original_due_date is null
  and due_date is not null;

alter table public.monthly_invoices
  drop constraint if exists monthly_invoices_payment_arrangement_date_check;

alter table public.monthly_invoices
  add constraint monthly_invoices_payment_arrangement_date_check
  check (
    payment_arrangement_active = false
    or promised_payment_date is not null
  );

create or replace function public.monthly_invoice_capture_payment_arrangement()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_balance bigint;
  v_now timestamptz := now();
begin
  v_balance := coalesce(new.balance_cents, greatest(0, coalesce(new.total_amount_cents, 0) - coalesce(new.amount_paid_cents, 0)));

  -- Existing admin "Edit billing dates" remains the UI entry point. When an
  -- already-issued unpaid invoice receives a later due date, treat it as an
  -- agreed payment arrangement rather than silently rewriting history.
  if tg_op = 'UPDATE'
     and old.due_date is not null
     and new.due_date is not null
     and new.due_date > old.due_date
     and lower(coalesce(old.status, '')) in ('sent', 'partially_paid', 'overdue')
     and coalesce(old.is_closed, false) = false
     and v_balance > 0 then

    new.original_due_date := coalesce(old.original_due_date, old.due_date);
    new.payment_arrangement_active := true;
    new.promised_payment_date := new.due_date;
    new.payment_arrangement_created_at := coalesce(old.payment_arrangement_created_at, v_now);
    new.payment_arrangement_updated_at := v_now;
    new.is_overdue := false;

    -- The invoice is still outstanding, but it is no longer collection-overdue
    -- until the promised date. Keep partial-payment truth when applicable.
    if lower(coalesce(new.status, '')) = 'overdue' then
      if coalesce(new.amount_paid_cents, 0) > 0 then
        new.status := 'partially_paid';
      else
        new.status := 'sent';
      end if;
    end if;
  end if;

  -- Settled/closed invoices cannot remain under an active arrangement.
  if lower(coalesce(new.status, '')) in ('paid', 'refunded')
     or coalesce(new.is_closed, false)
     or v_balance <= 0 then
    new.payment_arrangement_active := false;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_monthly_invoice_capture_payment_arrangement on public.monthly_invoices;
create trigger trg_monthly_invoice_capture_payment_arrangement
before update of due_date, status, is_closed, balance_cents, amount_paid_cents
on public.monthly_invoices
for each row
execute function public.monthly_invoice_capture_payment_arrangement();

create or replace function public.monthly_invoice_payment_arrangement_event()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.payment_arrangement_active = true
     and new.promised_payment_date is not null
     and (
       old.payment_arrangement_active is distinct from new.payment_arrangement_active
       or old.promised_payment_date is distinct from new.promised_payment_date
     ) then
    insert into public.monthly_invoice_events (invoice_id, kind, payload)
    values (
      new.id,
      'payment_arrangement_set',
      jsonb_build_object(
        'kind', 'payment_arrangement_set',
        'at', now(),
        'original_due_date', new.original_due_date,
        'previous_due_date', old.due_date,
        'promised_payment_date', new.promised_payment_date,
        'note', new.payment_arrangement_note,
        'actor', 'admin'
      )
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_monthly_invoice_payment_arrangement_event on public.monthly_invoices;
create trigger trg_monthly_invoice_payment_arrangement_event
after update of due_date, payment_arrangement_active, promised_payment_date
on public.monthly_invoices
for each row
execute function public.monthly_invoice_payment_arrangement_event();

comment on column public.monthly_invoices.original_due_date is
  'Original contractual due date retained when an issued invoice is moved onto a payment arrangement.';
comment on column public.monthly_invoices.payment_arrangement_active is
  'True while an outstanding invoice has an agreed future payment date.';
comment on column public.monthly_invoices.promised_payment_date is
  'Customer-agreed promise-to-pay date. Existing reminder/overdue logic uses due_date, which is moved to this date.';
comment on column public.monthly_invoices.payment_arrangement_note is
  'Optional internal note explaining the payment arrangement.';
