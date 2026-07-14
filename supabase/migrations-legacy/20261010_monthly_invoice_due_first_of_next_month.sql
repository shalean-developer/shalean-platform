-- Recurring monthly invoices: provisional draft due date = last calendar day of the
-- billing bucket (e.g. June 2026 → 2026-06-30). Finalize cron stamps actual
-- payment due (`today`) once the schedule is complete and the last visit has passed.

create or replace function public.monthly_invoice_due_date(p_month text)
returns date
language sql
immutable
as $$
  select (date_trunc('month', (p_month || '-01')::date) + interval '1 month' - interval '1 day')::date;
$$;

comment on function public.monthly_invoice_due_date(text) is
  'Provisional due_date for draft monthly_invoices.month (YYYY-MM): last day of billing month; replaced at finalize.';

-- Patch due_date on new invoice rows only (full trigger body from 20260701_monthly_billing_hardening).
create or replace function public.bookings_after_write_monthly_invoice()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_billing text;
  v_bucket text;
  v_inv_id uuid;
  v_inv_status text;
  v_line bigint;
  v_cutoff smallint;
  v_old_line bigint;
begin
  begin
    v_cutoff := nullif(trim(current_setting('app.monthly_invoice_last_day_cutoff_hour', true)), '')::smallint;
  exception when others then
    v_cutoff := null;
  end;
  v_cutoff := coalesce(v_cutoff, 18::smallint);

  if new.user_id is not null then
    select coalesce(up.billing_type, 'per_booking')
    into v_billing
    from public.user_profiles up
    where up.id = new.user_id;

    if v_billing = 'monthly' then
      if coalesce(new.payment_status, '') not in ('success', 'failed') then
        new.payment_status := 'pending_monthly';
        new.is_monthly_billing_booking := true;
      end if;
    end if;
  end if;

  if tg_op = 'UPDATE'
     and coalesce(old.status, '') is distinct from 'cancelled'
     and coalesce(new.status, '') = 'cancelled'
     and old.monthly_invoice_id is not null
  then
    select status into v_inv_status from public.monthly_invoices where id = old.monthly_invoice_id;
    if v_inv_status = 'draft' then
      v_old_line := public.booking_line_amount_cents(old.total_paid_zar, old.amount_paid_cents);
      update public.monthly_invoices
      set
        total_bookings = greatest(0, total_bookings - 1),
        total_amount_cents = greatest(0, total_amount_cents - v_old_line),
        updated_at = now()
      where id = old.monthly_invoice_id;
    end if;
    return new;
  end if;

  if new.user_id is null then
    return new;
  end if;

  select coalesce(up.billing_type, 'per_booking')
  into v_billing
  from public.user_profiles up
  where up.id = new.user_id;

  if v_billing is distinct from 'monthly' then
    return new;
  end if;

  if coalesce(new.status, '') = 'cancelled' then
    return new;
  end if;

  if coalesce(new.payment_status, '') is distinct from 'pending_monthly' then
    return new;
  end if;

  if new.monthly_invoice_id is not null then
    return new;
  end if;

  v_bucket := public.monthly_invoice_bucket_month(new.created_at, new.date, v_cutoff);
  if v_bucket is null then
    return new;
  end if;

  v_line := public.booking_line_amount_cents(new.total_paid_zar, new.amount_paid_cents);

  insert into public.monthly_invoices (customer_id, month, status, due_date)
  values (
    new.user_id,
    v_bucket,
    'draft',
    public.monthly_invoice_due_date(v_bucket)
  )
  on conflict (customer_id, month) do nothing;

  select id, status into v_inv_id, v_inv_status
  from public.monthly_invoices
  where customer_id = new.user_id and month = v_bucket
  limit 1;

  if v_inv_id is null or v_inv_status is distinct from 'draft' then
    return new;
  end if;

  new.monthly_invoice_id := v_inv_id;
  update public.monthly_invoices
  set
    total_bookings = total_bookings + 1,
    total_amount_cents = total_amount_cents + v_line,
    updated_at = now()
  where id = v_inv_id and status = 'draft';

  return new;
end;
$$;

update public.monthly_invoices
set
  due_date = public.monthly_invoice_due_date(month),
  updated_at = now()
where due_date is distinct from public.monthly_invoice_due_date(month);
