/**
 * Survives Paystack popup close + Next.js Fast Refresh remounts on the payment step.
 * Without this, clearBooking() before navigation can leave the user stranded on Step 4.
 */
export const BOOKING_V2_PENDING_SUCCESS_REF_KEY = "shalean:booking-v2:pending-success-ref";
export const BOOKING_V2_DRAFT_STORAGE_KEY = "shalean:booking-v2:v1";
export const BOOKING_V2_COMPLETED_RESET_KEY = "shalean:booking-v2:completed-reset";

export function rememberBookingV2SuccessRedirect(reference: string): void {
  const ref = reference.trim();
  if (!ref || typeof window === "undefined") return;
  try {
    sessionStorage.setItem(BOOKING_V2_PENDING_SUCCESS_REF_KEY, ref);
  } catch {
    /* ignore quota / private mode */
  }
}

export function consumeBookingV2SuccessRedirect(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const ref = sessionStorage.getItem(BOOKING_V2_PENDING_SUCCESS_REF_KEY)?.trim() || "";
    if (!ref) return null;
    sessionStorage.removeItem(BOOKING_V2_PENDING_SUCCESS_REF_KEY);
    return ref;
  } catch {
    return null;
  }
}

export function clearBookingV2DraftStorage(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(BOOKING_V2_DRAFT_STORAGE_KEY);
    sessionStorage.setItem(BOOKING_V2_COMPLETED_RESET_KEY, "1");
  } catch {
    /* ignore */
  }
}

/** Consume the one-time signal that a verified payment completed. */
export function consumeBookingV2CompletedReset(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const shouldReset = sessionStorage.getItem(BOOKING_V2_COMPLETED_RESET_KEY) === "1";
    if (shouldReset) sessionStorage.removeItem(BOOKING_V2_COMPLETED_RESET_KEY);
    return shouldReset;
  } catch {
    return false;
  }
}

export function bookingV2SuccessHref(reference: string, bookingId?: string | null): string {
  const referenceParam = `reference=${encodeURIComponent(reference.trim())}`;
  const persistedBookingId = bookingId?.trim() ?? "";
  const bookingParam = persistedBookingId
    ? `&bookingId=${encodeURIComponent(persistedBookingId)}`
    : "";
  return `/account/success?${referenceParam}${bookingParam}`;
}

/** Credit-covered / zero-balance bookings — no Paystack transaction to verify. */
export function bookingV2CoveredSuccessHref(bookingId: string): string {
  return `/account/success?bookingId=${encodeURIComponent(bookingId.trim())}&covered=1`;
}

/** Persist ref then hard-navigate. Prefer over soft router during Paystack callbacks. */
export function redirectToBookingV2Success(reference: string): void {
  const ref = reference.trim();
  if (!ref) return;
  rememberBookingV2SuccessRedirect(ref);
  window.location.assign(bookingV2SuccessHref(ref));
}
