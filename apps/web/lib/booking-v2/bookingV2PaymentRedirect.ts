/**
 * Survives Paystack popup close + Next.js Fast Refresh remounts on the payment step.
 * Without this, clearBooking() before navigation can leave the user stranded on Step 4.
 */
export const BOOKING_V2_PENDING_SUCCESS_REF_KEY = "shalean:booking-v2:pending-success-ref";
export const BOOKING_V2_DRAFT_STORAGE_KEY = "shalean:booking-v2:v1";

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
  } catch {
    /* ignore */
  }
}

export function bookingV2SuccessHref(reference: string): string {
  return `/account/success?reference=${encodeURIComponent(reference.trim())}`;
}

/** Persist ref then hard-navigate. Prefer over soft router during Paystack callbacks. */
export function redirectToBookingV2Success(reference: string): void {
  const ref = reference.trim();
  if (!ref) return;
  rememberBookingV2SuccessRedirect(ref);
  window.location.assign(bookingV2SuccessHref(ref));
}
