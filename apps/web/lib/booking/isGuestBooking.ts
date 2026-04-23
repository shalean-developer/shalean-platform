/** Bookings paid without a linked `auth.users` id (checkout as guest). */
export function isGuestBooking(booking: { user_id?: string | null }): boolean {
  const u = booking.user_id;
  return u == null || String(u).trim() === "";
}
