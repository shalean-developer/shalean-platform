import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { User } from "@supabase/supabase-js";

import { normalizeEmail } from "@/lib/booking/normalizeEmail";
import { trimCustomerPhone } from "@/lib/admin/adminBookingCustomerContact";
import {
  billingEmailFromLoginEmail,
} from "@/lib/customer/customerProfileContactFields";
import { pickBillingEmail } from "@/lib/zoho/shaleanBillingContactEmail";

export type CustomerProfileContact = {
  fullName: string | null;
  billingEmail: string | null;
  phone: string | null;
  loginEmail: string | null;
  /** Email stored on bookings when no real billing email exists (may be synthetic login). */
  bookingEmail: string;
};

function readMetaFullName(meta: unknown): string | null {
  if (!meta || typeof meta !== "object") return null;
  const m = meta as Record<string, unknown>;
  const fn = typeof m.full_name === "string" ? m.full_name.trim() : "";
  if (fn) return fn;
  const n = typeof m.name === "string" ? String(m.name).trim() : "";
  return n || null;
}

function readMetaPhone(meta: unknown): string | null {
  if (!meta || typeof meta !== "object") return null;
  const m = meta as Record<string, unknown>;
  return trimCustomerPhone(m.phone) ?? trimCustomerPhone(m.whatsapp);
}

/**
 * Resolves the canonical customer contact for admin booking + billing flows.
 * Prefers `user_profiles.billing_email` over auth login aliases.
 */
export async function readCustomerProfileContact(
  admin: SupabaseClient,
  userId: string,
  authUser?: User | null,
): Promise<CustomerProfileContact> {
  const { data: profile } = await admin
    .from("user_profiles")
    .select("full_name, billing_email, phone, phone_e164")
    .eq("id", userId)
    .maybeSingle();

  let auth = authUser ?? null;
  if (!auth) {
    const { data } = await admin.auth.admin.getUserById(userId);
    auth = data?.user ?? null;
  }

  const loginEmail = auth?.email ? normalizeEmail(auth.email) : null;
  const billingEmail =
    pickBillingEmail([
      (profile as { billing_email?: string | null } | null)?.billing_email,
      billingEmailFromLoginEmail(loginEmail),
    ]) ?? null;

  const fullName =
    String((profile as { full_name?: string | null } | null)?.full_name ?? "").trim() ||
    readMetaFullName(auth?.user_metadata) ||
    null;

  const phone =
    trimCustomerPhone((profile as { phone_e164?: string | null } | null)?.phone_e164) ??
    trimCustomerPhone((profile as { phone?: string | null } | null)?.phone) ??
    readMetaPhone(auth?.user_metadata);

  return {
    fullName,
    billingEmail,
    phone,
    loginEmail,
    bookingEmail: billingEmail ?? loginEmail ?? "",
  };
}

/**
 * Best-effort customer inbox for outbound email (recurring reminders, monthly invoices).
 * Prefers booking `customer_email`, then `user_profiles.billing_email`, then a real auth login.
 * Skips synthetic `@walkin.shalean.com` / `@cleaner.shalean.com` login aliases.
 */
export async function resolveCustomerOutboundEmail(
  admin: SupabaseClient,
  userId: string,
  opts?: { bookingCustomerEmail?: string | null; authUser?: User | null },
): Promise<string | null> {
  const contact = await readCustomerProfileContact(admin, userId, opts?.authUser);
  return pickBillingEmail([opts?.bookingCustomerEmail, contact.billingEmail, contact.loginEmail]);
}
