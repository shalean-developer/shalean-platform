-- Cleaner vs company revenue split (set once when cleaner is assigned after payment).

alter table public.bookings add column if not exists cleaner_payout_cents integer;
alter table public.bookings add column if not exists company_revenue_cents integer;
alter table public.bookings add column if not exists payout_percentage numeric(5, 4);
alter table public.bookings add column if not exists payout_type text;

comment on column public.bookings.cleaner_payout_cents is 'Cleaner share in cents; immutable after first write.';
comment on column public.bookings.company_revenue_cents is 'Platform share in cents (total paid minus cleaner payout).';
comment on column public.bookings.payout_percentage is 'Applied percentage for hybrid model; null when payout_type is fixed.';
comment on column public.bookings.payout_type is 'percentage | fixed';
