/** Recorded on `bookings.fallback_reason` when `assignment_type = auto_fallback`. */
export const FALLBACK_REASON_INVALID_CLEANER_ID = "invalid_cleaner_id" as const;
/** Reserved for future dispatch rules (selected cleaner busy / area). */
export const FALLBACK_REASON_CLEANER_NOT_AVAILABLE = "cleaner_not_available" as const;
export const FALLBACK_REASON_CLEANER_OFFLINE = "cleaner_offline" as const;
/** Chosen cleaner declined the dispatch offer; another cleaner was assigned. */
export const FALLBACK_REASON_CLEANER_REJECTED_OFFER = "cleaner_rejected_offer" as const;
/** Chosen cleaner did not respond before offer TTL; another cleaner was assigned. */
export const FALLBACK_REASON_CLEANER_OFFER_EXPIRED = "cleaner_offer_expired" as const;

export type BookingFallbackReason =
  | typeof FALLBACK_REASON_INVALID_CLEANER_ID
  | typeof FALLBACK_REASON_CLEANER_NOT_AVAILABLE
  | typeof FALLBACK_REASON_CLEANER_OFFLINE
  | typeof FALLBACK_REASON_CLEANER_REJECTED_OFFER
  | typeof FALLBACK_REASON_CLEANER_OFFER_EXPIRED;

const KNOWN = new Set<string>([
  FALLBACK_REASON_INVALID_CLEANER_ID,
  FALLBACK_REASON_CLEANER_NOT_AVAILABLE,
  FALLBACK_REASON_CLEANER_OFFLINE,
  FALLBACK_REASON_CLEANER_REJECTED_OFFER,
  FALLBACK_REASON_CLEANER_OFFER_EXPIRED,
]);

export function isBookingFallbackReason(s: string | null | undefined): s is BookingFallbackReason {
  return typeof s === "string" && KNOWN.has(s);
}
