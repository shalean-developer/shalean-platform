/**
 * Helpers for Paystack Playwright/API tests (Gap 3 — sandbox lifecycle).
 * Server routes remain unchanged; tests call real `/api/*` endpoints.
 */

/** Next calendar date `YYYY-MM-DD`, `daysAhead` from today (UTC date parts). */
export function futureDateYmd(daysAhead: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + Math.max(1, daysAhead));
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export type LockApiOk = {
  ok: true;
  pricingVersion: number;
  pricing_version_id?: string;
  total: number;
  hours: number;
  surgeMultiplier: number;
  surgeLabel?: string;
  vipTier: string;
  extras_line_items?: Array<{ slug: string; name: string; price: number }>;
  signature: string;
  lockExpiresAt: string;
};

export function isPaystackDecoupledReference(reference: string): boolean {
  return /^pay_/i.test(reference.trim());
}

/**
 * Builds a `locked` payload for `POST /api/paystack/initialize` from `POST /api/booking/lock` JSON.
 */
export function buildLockedBookingFromLockResponse(
  lock: LockApiOk,
  opts: {
    date: string;
    timeHm: string;
    location: string;
    serviceSlug: string;
    serviceTypeSlug: string;
    rooms: number;
    bathrooms: number;
    extraRooms?: number;
    extras?: string[];
    selectedCategory?: string;
    serviceGroup?: string;
  },
): Record<string, unknown> {
  const extras = Array.isArray(opts.extras) ? opts.extras : [];
  const extraRooms = typeof opts.extraRooms === "number" ? opts.extraRooms : 0;
  const selectedCategory = opts.selectedCategory ?? "home";
  const serviceGroup = opts.serviceGroup ?? "home";

  return {
    selectedCategory,
    service: opts.serviceSlug,
    service_group: serviceGroup,
    service_type: opts.serviceTypeSlug,
    location: opts.location,
    propertyType: "apartment",
    cleaningFrequency: "one_time",
    rooms: opts.rooms,
    bathrooms: opts.bathrooms,
    extraRooms,
    extras,
    date: opts.date,
    time: opts.timeHm,
    finalPrice: lock.total,
    finalHours: lock.hours,
    price: lock.total,
    duration: lock.hours,
    surge: lock.surgeMultiplier,
    ...(lock.surgeLabel ? { surgeLabel: lock.surgeLabel } : {}),
    vipTier: lock.vipTier,
    ...(Array.isArray(lock.extras_line_items) && lock.extras_line_items.length > 0
      ? { extras_line_items: lock.extras_line_items }
      : {}),
    pricingVersion: lock.pricingVersion,
    ...(lock.pricing_version_id ? { pricing_version_id: lock.pricing_version_id } : {}),
    quoteSignature: lock.signature,
    lockExpiresAt: lock.lockExpiresAt,
    locked: true,
    lockedAt: new Date().toISOString(),
  };
}
