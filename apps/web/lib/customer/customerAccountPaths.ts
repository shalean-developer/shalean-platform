/** Canonical customer portal paths (replaces legacy `/dashboard/*`). */
export const CUSTOMER_ACCOUNT_BOOKINGS_PATH = "/account/bookings";
export const CUSTOMER_ACCOUNT_BOOK_PATH = "/book";
export const CUSTOMER_ACCOUNT_PROFILE_PATH = "/account/profile";
export const CUSTOMER_ACCOUNT_INVOICES_PATH = "/account/invoices";
export const CUSTOMER_ACCOUNT_ADDRESSES_PATH = "/account/addresses";
export const CUSTOMER_ACCOUNT_REVIEWS_PATH = "/account/reviews";

export function customerBookingDetailPath(bookingId: string): string {
  return `${CUSTOMER_ACCOUNT_BOOKINGS_PATH}/${encodeURIComponent(bookingId)}`;
}

export function customerAccountBookingsUrl(appBase: string): string {
  return `${appBase.replace(/\/$/, "")}${CUSTOMER_ACCOUNT_BOOKINGS_PATH}`;
}

export function customerAccountReviewsUrl(appBase: string): string {
  return `${appBase.replace(/\/$/, "")}${CUSTOMER_ACCOUNT_REVIEWS_PATH}`;
}
