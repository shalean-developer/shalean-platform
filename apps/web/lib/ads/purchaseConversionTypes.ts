/**
 * Shared purchase conversion payload for Meta Pixel/CAPI and Google Ads/gtag.
 * `eventId` must match client + server (Paystack reference) for Meta dedupe.
 */
export type AdsPurchaseConversion = {
  /** Stable idempotency / Meta event_id — use Paystack reference. */
  eventId: string;
  valueZar: number;
  currency: string;
  bookingId?: string | null;
  email?: string | null;
  phone?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  gclid?: string | null;
  fbclid?: string | null;
  /** Meta `_fbp` cookie when available (browser). */
  fbp?: string | null;
  /** Meta `_fbc` cookie / constructed from fbclid. */
  fbc?: string | null;
  clientUserAgent?: string | null;
  clientIp?: string | null;
  eventSourceUrl?: string | null;
};

export function purchaseValueZar(amountCents: number | null | undefined, fallbackZar?: number | null): number {
  if (typeof amountCents === "number" && Number.isFinite(amountCents) && amountCents > 0) {
    return Math.round(amountCents) / 100;
  }
  if (typeof fallbackZar === "number" && Number.isFinite(fallbackZar) && fallbackZar > 0) {
    return Math.round(fallbackZar * 100) / 100;
  }
  return 0;
}
