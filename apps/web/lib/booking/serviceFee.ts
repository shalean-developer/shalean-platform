/**
 * Service fee on checkout (ZAR). Cleaner payout uses the base subtotal only; fee is company-only.
 *
 * Booking-v2 SoT uses `pricing_booking_config` fees (see bookingV2FeesConfig).
 * Env overrides below are legacy-only and require LEGACY_ENV_SERVICE_FEE_ENABLED=true.
 *
 * - `BOOKING_SERVICE_FEE_RULE=flat` (default) or `percent_floor` → max(2000¢, 5% of base cents)
 * - `BOOKING_SERVICE_FEE_CENTS` / `NEXT_PUBLIC_BOOKING_SERVICE_FEE_CENTS` override flat default (3000 = R30)
 */

export type BookingServiceFeeRule = "flat" | "percent_floor" | "optimized" | "none" | "percent";

function parseEnvCents(v: string | undefined): number | null {
  if (v == null || !String(v).trim()) return null;
  const n = parseInt(String(v).trim(), 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function legacyEnvServiceFeeEnabled(): boolean {
  return String(process.env.LEGACY_ENV_SERVICE_FEE_ENABLED ?? "")
    .trim()
    .toLowerCase() === "true";
}

export function resolveBookingServiceFeeRule(): BookingServiceFeeRule {
  // Phase 4: env fee rules are legacy-only (booking-v2 uses pricing_booking_config).
  if (!legacyEnvServiceFeeEnabled()) return "flat";
  const raw = (
    process.env.BOOKING_SERVICE_FEE_RULE ??
    process.env.NEXT_PUBLIC_BOOKING_SERVICE_FEE_RULE ??
    ""
  )
    .trim()
    .toLowerCase();
  if (raw === "none" || raw === "disabled" || raw === "off") return "none";
  if (raw === "percent") return "percent";
  if (raw === "percent_floor") return "percent_floor";
  if (raw === "optimized") return "optimized";
  return "flat";
}

/**
 * Tiered fee: 5% of base subtotal, floored at R20 and capped at R50 (company-only).
 */
export function computeOptimizedServiceFeeCentsFromBaseZar(baseZar: number): number {
  const baseCents = Math.max(0, Math.round(baseZar * 100));
  return Math.max(2000, Math.min(5000, Math.round(baseCents * 0.05)));
}

/** Default flat fee: R30 */
export const DEFAULT_BOOKING_SERVICE_FEE_CENTS = 3000;

/**
 * Fee in cents from the visit **subtotal** in whole ZAR (before fee).
 * Env cents overrides require LEGACY_ENV_SERVICE_FEE_ENABLED=true (Phase 4).
 */
export function computeServiceFeeCentsFromBaseZar(baseZar: number): number {
  const baseCents = Math.max(0, Math.round(baseZar * 100));
  const rule = resolveBookingServiceFeeRule();
  if (rule === "none") return 0;
  if (rule === "percent") {
    return Math.round(baseCents * 0.05);
  }
  if (rule === "optimized") {
    return computeOptimizedServiceFeeCentsFromBaseZar(baseZar);
  }
  if (rule === "percent_floor") {
    return Math.max(2000, Math.round(baseCents * 0.05));
  }
  if (legacyEnvServiceFeeEnabled()) {
    const fromEnv =
      parseEnvCents(process.env.NEXT_PUBLIC_BOOKING_SERVICE_FEE_CENTS) ??
      parseEnvCents(process.env.BOOKING_SERVICE_FEE_CENTS);
    return fromEnv ?? DEFAULT_BOOKING_SERVICE_FEE_CENTS;
  }
  return DEFAULT_BOOKING_SERVICE_FEE_CENTS;
}
