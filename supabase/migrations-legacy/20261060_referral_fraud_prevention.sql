-- Referral fraud prevention: fingerprint lookup index for duplicate detection.

create index if not exists referral_discount_redemptions_fingerprint_lookup_idx
  on public.referral_discount_redemptions (referral_code, checkout_fingerprint, created_at desc)
  where checkout_fingerprint is not null and length(trim(checkout_fingerprint)) > 0;

comment on index public.referral_discount_redemptions_fingerprint_lookup_idx is
  'Supports duplicate device fingerprint abuse queries on referral checkout redemptions.';
