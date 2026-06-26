import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { readCustomerEmailFromBookingSnapshot } from "@/lib/admin/adminBookingCustomerContact";
import { readCustomerProfileContact } from "@/lib/customer/readCustomerProfileContact";
import { normalizeBillingEmail, pickBillingEmail } from "@/lib/zoho/shaleanBillingContactEmail";

/** Pure priority order for monthly-invoice outbound email (testable). */
export function pickMonthlyInvoiceCustomerEmail(candidates: {
  profileBillingEmail?: string | null;
  bookingCustomerEmail?: string | null;
  loginEmail?: string | null;
}): string | null {
  return pickBillingEmail([
    candidates.profileBillingEmail,
    candidates.bookingCustomerEmail,
    candidates.loginEmail,
  ]);
}

/**
 * Best inbox for monthly-invoice customer email.
 * Prefers admin-maintained `user_profiles.billing_email`, then invoice bookings, then auth login.
 */
export async function resolveMonthlyInvoiceCustomerEmail(
  admin: SupabaseClient,
  params: { customerId: string; invoiceId: string },
): Promise<string | null> {
  const [{ data: authData }, { data: profile }, { data: bookings }] = await Promise.all([
    admin.auth.admin.getUserById(params.customerId),
    admin
      .from("user_profiles")
      .select("billing_email")
      .eq("id", params.customerId)
      .maybeSingle(),
    admin
      .from("bookings")
      .select("customer_email, booking_snapshot")
      .eq("monthly_invoice_id", params.invoiceId)
      .neq("status", "cancelled"),
  ]);

  const contact = await readCustomerProfileContact(admin, params.customerId, authData?.user ?? null);
  const profileBillingEmail = normalizeBillingEmail(
    (profile as { billing_email?: string | null } | null)?.billing_email,
  );

  let bookingCustomerEmail: string | null = null;
  for (const row of bookings ?? []) {
    const b = row as { customer_email?: string | null; booking_snapshot?: unknown };
    bookingCustomerEmail = pickBillingEmail([
      b.customer_email,
      readCustomerEmailFromBookingSnapshot(b.booking_snapshot),
    ]);
    if (bookingCustomerEmail) break;
  }

  return pickMonthlyInvoiceCustomerEmail({
    profileBillingEmail,
    bookingCustomerEmail,
    loginEmail: contact.loginEmail,
  });
}
