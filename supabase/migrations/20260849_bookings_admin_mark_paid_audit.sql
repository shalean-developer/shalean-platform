-- Audit fields for admin off-platform settlement (cash / Zoho).
alter table public.bookings add column if not exists marked_paid_by_admin_id uuid;

alter table public.bookings add column if not exists payment_method text;

alter table public.bookings add column if not exists payment_reference_external text;

alter table public.bookings drop constraint if exists bookings_payment_method_check;

alter table public.bookings
  add constraint bookings_payment_method_check
  check (payment_method is null or payment_method in ('cash', 'zoho'));

comment on column public.bookings.marked_paid_by_admin_id is
  'Auth user id (admin) who recorded off-platform payment; null when paid via Paystack checkout.';

comment on column public.bookings.payment_method is
  'Off-platform settlement channel set by admin mark-paid: cash | zoho.';

comment on column public.bookings.payment_reference_external is
  'External reference (e.g. Zoho invoice id) supplied when marking paid; distinct from paystack_reference.';
