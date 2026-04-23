import { reportOperationalIssue } from "@/lib/logging/systemLog";
import { metrics } from "@/lib/metrics/counters";

/** Mismatch noise floor (ZAR): small rounding / timing differences below this are ignored. */
const MISMATCH_EPS_ZAR = 1;
/** Alert when |expected − actual| exceeds this — likely config, tax, or fraud signal. */
const HIGH_SEVERITY_DIFF_ZAR = 5;

/** Server-side: expected checkout total (ZAR) vs Paystack charged amount (mismatch if > 1 ZAR). */
export function recordPaystackPricingMismatch(fields: {
  expectedZar: number;
  amountCents: number;
  bookingId?: string | null;
  pricingVersionId?: string | null;
  reference?: string | null;
}): void {
  if (!Number.isFinite(fields.expectedZar) || fields.expectedZar < 0) return;
  const actualZar = Math.round(fields.amountCents / 100);
  if (!Number.isFinite(actualZar)) return;
  const diffZar = actualZar - fields.expectedZar;
  if (Math.abs(diffZar) <= MISMATCH_EPS_ZAR) return;

  metrics.increment("pricing.mismatch.total", {
    bookingId: fields.bookingId ?? null,
    pricingVersionId: fields.pricingVersionId ?? null,
    reference: fields.reference ?? null,
    expectedZar: fields.expectedZar,
    actualZar,
    diffZar,
  });

  if (Math.abs(diffZar) > HIGH_SEVERITY_DIFF_ZAR) {
    metrics.increment("pricing.mismatch.high_severity", {
      bookingId: fields.bookingId ?? null,
      pricingVersionId: fields.pricingVersionId ?? null,
      reference: fields.reference ?? null,
      expectedZar: fields.expectedZar,
      actualZar,
      diffZar,
      severity: "high",
    });
    void reportOperationalIssue("error", "pricing.checkout_mismatch", "Checkout total vs Paystack charge differs by more than R5.", {
      expectedZar: fields.expectedZar,
      actualZar,
      diffZar,
      bookingId: fields.bookingId ?? null,
      pricingVersionId: fields.pricingVersionId ?? null,
      reference: fields.reference ?? null,
    });
  }
}

export function expectedCheckoutZarFromVerify(
  snapshot: { total_zar?: number } | null,
  metadata: Record<string, string | undefined>,
): number | null {
  if (snapshot && typeof snapshot.total_zar === "number" && Number.isFinite(snapshot.total_zar)) {
    return Math.round(snapshot.total_zar);
  }
  const raw = metadata.pay_total_zar;
  const m = typeof raw === "string" ? parseInt(raw, 10) : NaN;
  if (Number.isFinite(m) && m > 0) return m;
  return null;
}

export function pricingVersionIdFromLocked(
  locked: { pricing_version_id?: string | null } | null | undefined,
): string | null {
  const v = locked?.pricing_version_id;
  if (typeof v === "string" && v.trim()) return v.trim();
  return null;
}
