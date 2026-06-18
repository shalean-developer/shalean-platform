import type { SupabaseClient } from "@supabase/supabase-js";

/** Normalize admin-facing customer phone strings from booking / profile sources. */
export function trimCustomerPhone(raw: unknown): string | null {
  const phone = typeof raw === "string" ? raw.trim() : "";
  return phone.length >= 5 ? phone : null;
}
/** Normalize admin-facing customer display names. */
export function trimCustomerName(raw: unknown): string | null {
  const name = typeof raw === "string" ? raw.trim().replace(/\s+/g, " ") : "";
  return name.length >= 2 ? name : null;
}

export function readCustomerPhoneFromBookingSnapshot(snap: unknown): string | null {
  if (!snap || typeof snap !== "object" || Array.isArray(snap)) return null;
  const customer = (snap as { customer?: { phone?: unknown } }).customer;
  return trimCustomerPhone(customer?.phone);
}

export function readCustomerNameFromBookingSnapshot(snap: unknown): string | null {
  if (!snap || typeof snap !== "object" || Array.isArray(snap)) return null;
  const customer = (snap as { customer?: { name?: unknown } }).customer;
  return trimCustomerName(customer?.name);
}

export function readCustomerPhoneFromAuthMetadata(metadata: unknown, authPhone?: string | null): string | null {
  const meta = metadata && typeof metadata === "object" && !Array.isArray(metadata)
    ? (metadata as { phone?: unknown; whatsapp?: unknown })
    : null;
  return (
    trimCustomerPhone(meta?.phone) ??
    trimCustomerPhone(meta?.whatsapp) ??
    trimCustomerPhone(authPhone)
  );
}

/** Best-effort phone from Supabase Auth (`user_metadata.phone` / `whatsapp`, then `auth.users.phone`). */
export async function resolveCustomerPhoneFromAuthAdmin(
  admin: SupabaseClient,
  userId: string | null | undefined,
): Promise<string | null> {
  const uid = String(userId ?? "").trim();
  if (!uid) return null;
  try {
    const { data: authUser } = await admin.auth.admin.getUserById(uid);
    return readCustomerPhoneFromAuthMetadata(authUser?.user?.user_metadata, authUser?.user?.phone);
  } catch {
    return null;
  }
}

export function resolveAdminBookingCustomerPhone(input: {
  customer_phone?: string | null;
  phone?: string | null;
  userProfilePhone?: string | null;
  bookingSnapshot?: unknown;
  fallbackPhone?: string | null;
}): string | null {
  return (
    trimCustomerPhone(input.customer_phone) ??
    trimCustomerPhone(input.phone) ??
    trimCustomerPhone(input.userProfilePhone) ??
    readCustomerPhoneFromBookingSnapshot(input.bookingSnapshot) ??
    readCustomerPhoneFromV2BookingSnapshot(input.bookingSnapshot) ??
    trimCustomerPhone(input.fallbackPhone)
  );
}

function readCustomerPhoneFromV2BookingSnapshot(snap: unknown): string | null {
  if (!snap || typeof snap !== "object" || Array.isArray(snap)) return null;
  const o = snap as { contactPhone?: unknown; customer?: { phone?: unknown } };
  return trimCustomerPhone(o.contactPhone) ?? trimCustomerPhone(o.customer?.phone);
}
export function resolveAdminBookingCustomerName(input: {
  customer_name?: string | null;
  userProfileFullName?: string | null;
  bookingSnapshot?: unknown;
  fallbackName?: string | null;
  customerEmail?: string | null;
}): string {
  const resolved =
    trimCustomerName(input.customer_name) ??
    trimCustomerName(input.userProfileFullName) ??
    readCustomerNameFromBookingSnapshot(input.bookingSnapshot) ??
    trimCustomerName(input.fallbackName);

  if (resolved) return resolved;

  const emailLocal = input.customerEmail?.split("@")[0]?.trim();
  return emailLocal || "Customer";
}
