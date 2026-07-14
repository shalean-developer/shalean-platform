-- Platform service fee (on top of visit subtotal). Cleaner payout uses base_amount_cents only.

alter table public.bookings add column if not exists service_fee_cents integer not null default 0;
alter table public.bookings add column if not exists base_amount_cents integer;

comment on column public.bookings.service_fee_cents is 'Platform fee in cents; not included in cleaner payout base.';
comment on column public.bookings.base_amount_cents is 'Visit subtotal in cents (before service fee); null = legacy rows (payout base = amount paid).';
