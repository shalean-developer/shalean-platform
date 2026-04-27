/** Buckets for `payment_conversion_seconds` (first payment link sent → payment completed). */
export type PaymentConversionBucket = "instant" | "fast" | "medium" | "slow";

/**
 * Derives funnel bucket from seconds between first payment-link send and successful payment.
 * `< 300` instant, `< 1800` fast, `< 7200` medium, else slow.
 */
export function paymentConversionBucketFromSeconds(seconds: number | null | undefined): PaymentConversionBucket | null {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return null;
  if (seconds < 300) return "instant";
  if (seconds < 1800) return "fast";
  if (seconds < 7200) return "medium";
  return "slow";
}
