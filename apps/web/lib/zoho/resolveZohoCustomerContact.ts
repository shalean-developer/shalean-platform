import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  readCustomerEmailFromBookingSnapshot,
  readCustomerPhoneFromAuthMetadata,
  readCustomerPhoneFromBookingSnapshot,
  resolveAdminBookingCustomerName,
  trimCustomerPhone,
} from "@/lib/admin/adminBookingCustomerContact";
import { pickBillingEmail, phoneFromSystemLoginEmail } from "@/lib/zoho/shaleanBillingContactEmail";

export type ZohoCustomerContact = {
  /** Omitted when the customer has no real email (walk-in / phone-only). */
  email?: string;
  name: string;
  phone?: string;
};

function readSnapshotCustomerEmail(snapshot: unknown): string | null {
  return pickBillingEmail([readCustomerEmailFromBookingSnapshot(snapshot)]);
}

function resolveDisplayName(input: {
  bookingCustomerName?: string | null;
  profileFullName?: string | null;
  authMetadata?: unknown;
  bookingSnapshot?: unknown;
  fallbackEmail?: string | null;
}): string {
  const meta =
    input.authMetadata && typeof input.authMetadata === "object" && !Array.isArray(input.authMetadata)
      ? (input.authMetadata as { full_name?: unknown; name?: unknown })
      : null;
  const metaName =
    typeof meta?.full_name === "string"
      ? meta.full_name.trim()
      : typeof meta?.name === "string"
        ? meta.name.trim()
        : null;

  return resolveAdminBookingCustomerName({
    customer_name: input.bookingCustomerName,
    userProfileFullName: input.profileFullName ?? metaName,
    bookingSnapshot: input.bookingSnapshot,
    customerEmail: input.fallbackEmail,
  });
}

async function loadAuthAndProfile(admin: SupabaseClient, userId: string) {
  const [authRes, profileRes] = await Promise.all([
    admin.auth.admin.getUserById(userId),
    admin
      .from("user_profiles")
      .select("full_name, billing_email, phone, phone_e164")
      .eq("id", userId)
      .maybeSingle(),
  ]);

  const authUser = authRes.data?.user ?? null;
  const profile = profileRes.data as {
    full_name?: string | null;
    billing_email?: string | null;
    phone?: string | null;
    phone_e164?: string | null;
  } | null;

  return {
    authEmail: authUser?.email ?? null,
    authPhone: readCustomerPhoneFromAuthMetadata(authUser?.user_metadata, authUser?.phone),
    authMetadata: authUser?.user_metadata,
    profileFullName: profile?.full_name ?? null,
    profileBillingEmail: profile?.billing_email ?? null,
    profilePhone: trimCustomerPhone(profile?.phone_e164) ?? trimCustomerPhone(profile?.phone),
  };
}

function snapshotPhone(snapshot: unknown): string | null {
  if (!snapshot) return null;
  const fromV1 = readCustomerPhoneFromBookingSnapshot(snapshot);
  if (fromV1) return fromV1;
  if (typeof snapshot === "object" && snapshot !== null) {
    const snap = snapshot as { contactPhone?: unknown };
    return trimCustomerPhone(snap.contactPhone);
  }
  return null;
}

function buildContact(input: {
  name: string;
  email?: string | null;
  phone?: string | null;
}): { ok: true; contact: ZohoCustomerContact } | { ok: false; error: string } {
  const name = input.name.trim();
  if (name.length < 2) return { ok: false, error: "customer_name_unresolved" };

  const phone = trimCustomerPhone(input.phone);
  const email = pickBillingEmail([input.email]);

  if (!email && !phone) return { ok: false, error: "customer_contact_unresolved" };

  return {
    ok: true,
    contact: {
      name,
      ...(email ? { email } : {}),
      ...(phone ? { phone } : {}),
    },
  };
}

/**
 * Resolve the customer identity Shalean should use in Zoho Books.
 * Uses booking / snapshot / profile fields — never `@cleaner.shalean.com` or `@walkin.shalean.com`.
 */
export async function resolveZohoCustomerContactForUser(
  admin: SupabaseClient,
  userId: string,
  hints?: {
    bookingCustomerEmail?: string | null;
    bookingCustomerName?: string | null;
    bookingCustomerPhone?: string | null;
    bookingSnapshot?: unknown;
  },
): Promise<{ ok: true; contact: ZohoCustomerContact } | { ok: false; error: string }> {
  const uid = String(userId ?? "").trim();
  if (!uid) return { ok: false, error: "missing_user_id" };

  const auth = await loadAuthAndProfile(admin, uid);
  const resolvedPhone =
    trimCustomerPhone(hints?.bookingCustomerPhone) ??
    auth.profilePhone ??
    auth.authPhone ??
    snapshotPhone(hints?.bookingSnapshot) ??
    phoneFromSystemLoginEmail(hints?.bookingCustomerEmail) ??
    phoneFromSystemLoginEmail(auth.authEmail);

  const billingEmail = pickBillingEmail([
    auth.profileBillingEmail,
    hints?.bookingCustomerEmail,
    readSnapshotCustomerEmail(hints?.bookingSnapshot),
    auth.authEmail,
  ]);

  const name = resolveDisplayName({
    bookingCustomerName: hints?.bookingCustomerName,
    profileFullName: auth.profileFullName,
    authMetadata: auth.authMetadata,
    bookingSnapshot: hints?.bookingSnapshot,
    fallbackEmail: billingEmail,
  });

  return buildContact({ name, email: billingEmail, phone: resolvedPhone });
}

/** Resolve customer contact for a paid per-booking invoice row. */
export async function resolveZohoCustomerContactForBooking(
  admin: SupabaseClient,
  booking: {
    user_id?: string | null;
    customer_email?: string | null;
    customer_name?: string | null;
    customer_phone?: string | null;
    booking_snapshot?: unknown;
  },
): Promise<{ ok: true; contact: ZohoCustomerContact } | { ok: false; error: string }> {
  const userId = String(booking.user_id ?? "").trim();
  if (userId) {
    return resolveZohoCustomerContactForUser(admin, userId, {
      bookingCustomerEmail: booking.customer_email,
      bookingCustomerName: booking.customer_name,
      bookingCustomerPhone: booking.customer_phone,
      bookingSnapshot: booking.booking_snapshot,
    });
  }

  const billingEmail = pickBillingEmail([
    booking.customer_email,
    readSnapshotCustomerEmail(booking.booking_snapshot),
  ]);
  const name = resolveDisplayName({
    bookingCustomerName: booking.customer_name,
    bookingSnapshot: booking.booking_snapshot,
    fallbackEmail: billingEmail,
  });

  return buildContact({
    name,
    email: billingEmail,
    phone:
      trimCustomerPhone(booking.customer_phone) ??
      snapshotPhone(booking.booking_snapshot) ??
      phoneFromSystemLoginEmail(booking.customer_email),
  });
}

/** Resolve customer contact for a monthly invoice using profile, auth, and child bookings. */
export async function resolveZohoCustomerContactForMonthlyInvoice(
  admin: SupabaseClient,
  params: { invoiceId: string; customerId: string },
): Promise<{ ok: true; contact: ZohoCustomerContact } | { ok: false; error: string }> {
  const { data: bookings } = await admin
    .from("bookings")
    .select("customer_email, customer_name, customer_phone, booking_snapshot")
    .eq("monthly_invoice_id", params.invoiceId)
    .neq("status", "cancelled")
    .order("date", { ascending: false })
    .limit(20);

  let hintEmail: string | null = null;
  let hintName: string | null = null;
  let hintPhone: string | null = null;
  let hintSnapshot: unknown = null;

  for (const row of bookings ?? []) {
    const b = row as {
      customer_email?: string | null;
      customer_name?: string | null;
      customer_phone?: string | null;
      booking_snapshot?: unknown;
    };
    if (!hintName && b.customer_name) hintName = b.customer_name;
    if (!hintPhone && b.customer_phone) hintPhone = b.customer_phone;
    if (!hintSnapshot && b.booking_snapshot) hintSnapshot = b.booking_snapshot;
    if (!hintEmail) {
      hintEmail =
        pickBillingEmail([b.customer_email, readSnapshotCustomerEmail(b.booking_snapshot)]) ?? null;
      if (hintEmail) break;
    }
  }

  return resolveZohoCustomerContactForUser(admin, params.customerId, {
    bookingCustomerEmail: hintEmail,
    bookingCustomerName: hintName,
    bookingCustomerPhone: hintPhone,
    bookingSnapshot: hintSnapshot,
  });
}
