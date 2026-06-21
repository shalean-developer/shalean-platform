/** Production `bookings` may use `customer_id`; older schemas use `user_id`. */
export type BookingCustomerOwnershipColumn = "customer_id" | "user_id";

export type BookingCustomerIdentityRow = {
  customer_id?: string | null;
  user_id?: string | null;
};

/** Canonical customer auth id on a booking row across schema variants. */
export function bookingCustomerKey(row: BookingCustomerIdentityRow): string {
  const customerId = typeof row.customer_id === "string" ? row.customer_id.trim() : "";
  if (customerId) return customerId;
  return typeof row.user_id === "string" ? row.user_id.trim() : "";
}

/** Insert/update patch for the active bookings ownership column (`customer_id` or `user_id`). */
export function bookingCustomerOwnershipPatch(
  customerAuthUserId: string,
  column: BookingCustomerOwnershipColumn,
): Partial<Record<BookingCustomerOwnershipColumn, string>> {
  const id = customerAuthUserId.trim();
  if (!id) return {};
  return { [column]: id };
}

export function normalizeBookingCustomerIdentity<T extends BookingCustomerIdentityRow>(row: T): T {
  const key = bookingCustomerKey(row);
  if (!key) return row;
  return {
    ...row,
    customer_id: row.customer_id ?? key,
    user_id: row.user_id ?? key,
  };
}
