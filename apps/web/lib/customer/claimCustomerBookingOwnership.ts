import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeEmail } from "@/lib/booking/normalizeEmail";
import { metrics } from "@/lib/metrics/counters";
import { reportOperationalIssue } from "@/lib/logging/systemLog";
import { resolveBookingOwnershipColumn } from "@/lib/customer/customerBookingsForUser";

export type ClaimCustomerBookingOwnershipResult =
  | { ok: true; claimed: number }
  | { ok: false; error: string; status: number };

/**
 * Permanently attaches legacy email-only booking rows to the signed-in customer.
 *
 * Safety boundary:
 * - only rows with a null canonical ownership column are eligible;
 * - the normalized booking email must match the authenticated user's email;
 * - rows already owned by any account are never reassigned.
 */
export async function claimCustomerBookingOwnership(
  admin: SupabaseClient,
  userId: string,
  viewerEmail: string | null | undefined,
): Promise<ClaimCustomerBookingOwnershipResult> {
  const uid = String(userId ?? "").trim();
  const email = normalizeEmail(String(viewerEmail ?? ""));
  if (!uid || email.length < 3) return { ok: true, claimed: 0 };

  const ownershipColumn = await resolveBookingOwnershipColumn(admin);
  const { data, error } = await admin
    .from("bookings")
    .update({ [ownershipColumn]: uid })
    .eq("customer_email", email)
    .is(ownershipColumn, null)
    .select("id");

  if (error) {
    void reportOperationalIssue("error", "customer/bookings/claim_ownership", error.message, {
      userId: uid,
      ownershipColumn,
    });
    return { ok: false, error: "Could not repair booking ownership.", status: 500 };
  }

  const claimed = Array.isArray(data) ? data.length : 0;
  if (claimed > 0) {
    metrics.increment("customer.bookings.email_orphan_claim_rows", { count: claimed });
  }
  return { ok: true, claimed };
}
