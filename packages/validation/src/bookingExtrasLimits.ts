/**
 * Shared cap for lock quote, persist sanitizer, admin Paystack lock, and client pre-checks.
 * Keep all call sites on this constant so UX and DB rules stay aligned.
 */
export const MAX_BOOKING_EXTRAS_ROWS = 24;

export function bookingExtrasOverClientLimit(extras: readonly unknown[]): boolean {
  return extras.length > MAX_BOOKING_EXTRAS_ROWS;
}

export function bookingExtrasClientLimitMessage(): string {
  return `Too many add-ons selected (max ${MAX_BOOKING_EXTRAS_ROWS}). Remove some on the previous step, then try again.`;
}
