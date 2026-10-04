-- PAYOUT-E2E-002: make cleaner payout settlement truth explicit.
-- Bank transfer is the current primary cleaner payment method; Paystack remains optional.
-- Existing historical paid rows are intentionally not backfilled/fabricated.

alter table public.cleaner_payouts
  add column if not exists payment_method text,
  add column if not exists paid_by uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'cleaner_payouts_payment_method_check'
      and conrelid = 'public.cleaner_payouts'::regclass
  ) then
    alter table public.cleaner_payouts
      add constraint cleaner_payouts_payment_method_check
      check (payment_method is null or payment_method in ('bank_transfer', 'paystack', 'manual_legacy'));
  end if;
end
$$;

comment on column public.cleaner_payouts.payment_method is
  'How Shalean settled the cleaner payout: bank_transfer (current primary), paystack, or manual_legacy. Null means historical/unknown; do not fabricate.';
comment on column public.cleaner_payouts.paid_by is
  'Admin user id that recorded/released an off-platform payout. Paystack webhook settlements may leave this null.';
comment on column public.cleaner_payouts.payment_reference is
  'External settlement reference. For bank transfers this should be the bank/EFT transaction reference; for Paystack this is the transfer/reference code.';
