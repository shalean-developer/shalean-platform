import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { readCustomerEmailFromBookingSnapshot } from "@/lib/admin/adminBookingCustomerContact";
import { resolveCustomerOutboundEmail } from "@/lib/customer/readCustomerProfileContact";
import { pickBillingEmail } from "@/lib/zoho/shaleanBillingContactEmail";

/**
 * Best inbox for monthly-invoice customer email.
 * Uses invoice line bookings, then profile billing email, then real auth login.
 */
export async function resolveMonthlyInvoiceCustomerEmail(
  admin: SupabaseClient,
  params: { customerId: string; invoiceId: string },
): Promise<string | null> {
  const { data: bookings } = await admin
    .from("bookings")
    .select("customer_email, booking_snapshot")
    .eq("monthly_invoice_id", params.invoiceId)
    .neq("status", "cancelled");

  let hintEmail: string | null = null;
  for (const row of bookings ?? []) {
    const b = row as { customer_email?: string | null; booking_snapshot?: unknown };
    hintEmail = pickBillingEmail([
      b.customer_email,
      readCustomerEmailFromBookingSnapshot(b.booking_snapshot),
    ]);
    if (hintEmail) break;
  }

  const { data: authData } = await admin.auth.admin.getUserById(params.customerId);
  return resolveCustomerOutboundEmail(admin, params.customerId, {
    authUser: authData?.user ?? null,
    bookingCustomerEmail: hintEmail,
  });
}
