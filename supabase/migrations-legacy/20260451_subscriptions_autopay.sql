alter table public.subscriptions
  add column if not exists paystack_customer_code text,
  add column if not exists authorization_code text,
  add column if not exists last_payment_date date,
  add column if not exists payment_status text not null default 'pending'
    check (payment_status in ('pending', 'success', 'failed')),
  add column if not exists retry_count integer not null default 0,
  add column if not exists last_payment_error text,
  add column if not exists last_charge_reference text,
  add column if not exists last_reminder_date date;

create index if not exists subscriptions_autopay_idx
  on public.subscriptions (status, next_booking_date, retry_count);
