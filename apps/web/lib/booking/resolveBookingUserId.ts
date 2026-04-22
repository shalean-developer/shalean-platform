import type { SupabaseClient } from "@supabase/supabase-js";
import type { BookingSnapshotV1 } from "@/lib/booking/paystackChargeTypes";
import { resolvePaystackUserId } from "@/lib/booking/resolvePaystackUserId";
import { reportOperationalIssue } from "@/lib/logging/systemLog";

/**
 * Resolves `bookings.user_id` for Paystack persistence:
 * 1) UUID from booking snapshot / Paystack metadata (guest checkout with user id in metadata)
 * 2) Else lookup auth.users by normalized customer email via RPC (service role only)
 *
 * DB trigger `auto_link_booking_user` still fills `user_id` on insert if this returns null.
 */
export async function resolveBookingUserId(
  supabase: SupabaseClient,
  snapshot: BookingSnapshotV1 | null,
  paystackMetadata: Record<string, string | undefined> | null | undefined,
  customerEmailNormalized: string,
): Promise<string | null> {
  const fromCharge = resolvePaystackUserId(snapshot, paystackMetadata ?? null);
  if (fromCharge) return fromCharge;

  const em = customerEmailNormalized.trim();
  if (!em) return null;

  const { data, error } = await supabase.rpc("resolve_auth_user_id_by_email", {
    p_email: em,
  });

  if (error) {
    await reportOperationalIssue("warn", "resolveBookingUserId", error.message, {
      hint: "resolve_auth_user_id_by_email RPC — apply migration 20260424_booking_auto_link_users.sql",
    });
    return null;
  }

  if (typeof data === "string" && data.length > 0) return data;
  return null;
}
