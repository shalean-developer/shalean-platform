import "server-only";

import type { PaymentConversionBucket } from "@/lib/booking/paymentConversionBucket";

/** Max Paystack charge attempts before payment-link fallback (within grace). */
export function recurringAutoChargeMaxRetries(): number {
  const n = Number(process.env.RECURRING_AUTO_CHARGE_MAX_RETRIES ?? "4");
  return Number.isFinite(n) && n >= 1 ? Math.min(12, Math.floor(n)) : 4;
}

/** After first failure, wait this long before fallback even if retries remain (grace window). */
export function recurringChargeGraceMs(): number {
  const h = Number(process.env.RECURRING_CHARGE_GRACE_HOURS ?? "24");
  const hours = Number.isFinite(h) && h > 0 ? Math.min(168, h) : 24;
  return hours * 3600_000;
}

/** Backoff after failure `attemptNumber` (1-based after increment). */
export function recurringChargeBackoffMsAfterFailure(attemptNumber: number): number {
  const minutes = [5, 15, 60, 180, 360, 720];
  const idx = Math.min(Math.max(attemptNumber, 1), minutes.length) - 1;
  return minutes[idx]! * 60_000;
}

export function recurringSmartChargeEnabled(): boolean {
  const v = String(process.env.RECURRING_SMART_CHARGE_ENABLED ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

export function recurringSmartChargeDeferHoursForBucket(bucket: PaymentConversionBucket | null): number {
  if (!recurringSmartChargeEnabled()) return 0;
  if (bucket === "slow" || bucket === "medium") {
    const n = Number(process.env.RECURRING_SMART_CHARGE_DEFER_HOURS_SLOW ?? "48");
    return Number.isFinite(n) && n >= 0 ? Math.min(168, n) : 48;
  }
  const n = Number(process.env.RECURRING_SMART_CHARGE_DEFER_HOURS_FAST ?? "0");
  return Number.isFinite(n) && n >= 0 ? Math.min(72, n) : 0;
}
