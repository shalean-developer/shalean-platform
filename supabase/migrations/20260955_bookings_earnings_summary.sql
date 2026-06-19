-- v3 cleaner earnings rules: structured breakdown on bookings.

alter table public.bookings
  add column if not exists earnings_summary jsonb;

comment on column public.bookings.earnings_summary is
  'Frozen server-computed earnings breakdown (v3 rules): customer total, per-cleaner payouts, bonuses, company revenue.';
