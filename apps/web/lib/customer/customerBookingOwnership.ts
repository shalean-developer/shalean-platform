import { normalizeEmail } from "@/lib/booking/normalizeEmail";
import { bookingCustomerKey, type BookingCustomerIdentityRow } from "@/lib/booking/bookingCustomerIdentity";

/** Minimum normalized email length to treat as a stable ownership signal (avoids empty/"a"). */
const MIN_EMAIL_LEN = 3;

export type BookingOwnershipProbe = BookingCustomerIdentityRow & {
  customer_email?: string | null;
};

/**
 * Whether the signed-in viewer may see this booking in customer APIs:
 * — usual case: `customer_id` / `user_id` matches auth uid;
 * — orphan repair: ownership id is null and `customer_email` matches the viewer's auth email (normalized).
 *
 * Does **not** grant access when ownership points at another account (even if email matches).
 */
export function customerCanAccessBookingRow(
  row: BookingOwnershipProbe,
  authUserId: string,
  viewerEmailNormalized: string,
): boolean {
  const uid = String(authUserId ?? "").trim();
  const rowUid = bookingCustomerKey(row);
  if (rowUid === uid) return true;
  if (rowUid !== "") return false;
  const rowEmail = normalizeEmail(String(row.customer_email ?? ""));
  const viewer = normalizeEmail(viewerEmailNormalized);
  return rowEmail.length >= MIN_EMAIL_LEN && viewer.length >= MIN_EMAIL_LEN && rowEmail === viewer;
}

export function mergeCustomerBookingListsByCreatedAtDesc<T extends { id: string; created_at?: string | null }>(
  primary: T[],
  secondary: T[],
): T[] {
  const map = new Map<string, T>();
  for (const r of primary) {
    const id = String(r.id ?? "").trim();
    if (id) map.set(id, r);
  }
  for (const r of secondary) {
    const id = String(r.id ?? "").trim();
    if (id && !map.has(id)) map.set(id, r);
  }
  return [...map.values()].sort((a, b) => String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")));
}
