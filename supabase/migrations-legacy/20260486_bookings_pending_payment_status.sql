-- `pending_payment`: row created at Paystack initialize (see apps/web/lib/booking/insertPendingPaymentBooking.ts).
-- After charge.success / verify, upsert updates to `status = 'pending'` for dispatch.
-- Cron and dispatch queries that filter `bookings.status = 'pending'` ignore pre-payment rows.

comment on column public.bookings.status is
  'pending_payment = Paystack checkout opened; pending = paid / awaiting cleaner; assigned | in_progress | completed | cancelled | failed per product.';
