import "server-only";

import type { BookingCustomerAuthType } from "@/lib/booking/paystackChargeTypes";
import type { BookingFlowIntakeInput } from "@/lib/booking/insertBookingFlowIntake";
import { insertBookingFromFlowIntake } from "@/lib/booking/insertBookingFlowIntake";
import type { SupabaseClient } from "@supabase/supabase-js";

export type AuthenticatedBookFlowIntakeInput = BookingFlowIntakeInput & {
  userId: string;
  authType: Extract<BookingCustomerAuthType, "login" | "register">;
};

/**
 * `/book` flow intake — authenticated customers only. Wraps flow intake and stamps `user_id`
 * on the booking row and snapshot (never guest).
 */
export async function insertAuthenticatedBookFlowIntake(
  admin: SupabaseClient,
  input: AuthenticatedBookFlowIntakeInput,
): Promise<{ ok: true; bookingId: string } | { ok: false; error: string }> {
  const userId = input.userId.trim();
  if (!userId) return { ok: false, error: "Authentication required." };

  const result = await insertBookingFromFlowIntake(admin, input);
  if (!result.ok) return result;

  const { data: row, error: readErr } = await admin
    .from("bookings")
    .select("booking_snapshot")
    .eq("id", result.bookingId)
    .eq("status", "pending_payment")
    .maybeSingle();

  if (readErr || !row) {
    await admin.from("bookings").delete().eq("id", result.bookingId).eq("status", "pending_payment");
    return { ok: false, error: "Could not finalize authenticated booking." };
  }

  const snapRaw = (row as { booking_snapshot?: unknown }).booking_snapshot;
  const snap =
    snapRaw && typeof snapRaw === "object" && !Array.isArray(snapRaw)
      ? ({ ...(snapRaw as Record<string, unknown>) } as Record<string, unknown>)
      : { v: 1 };

  const customerRaw = snap.customer;
  const customer =
    customerRaw && typeof customerRaw === "object" && !Array.isArray(customerRaw)
      ? { ...(customerRaw as Record<string, unknown>) }
      : {};

  snap.customer = {
    ...customer,
    user_id: userId,
    type: input.authType,
  };

  const { error: upErr } = await admin
    .from("bookings")
    .update({
      user_id: userId,
      booking_snapshot: snap,
    })
    .eq("id", result.bookingId)
    .eq("status", "pending_payment");

  if (upErr) {
    await admin.from("bookings").delete().eq("id", result.bookingId).eq("status", "pending_payment");
    return { ok: false, error: upErr.message };
  }

  return { ok: true, bookingId: result.bookingId };
}
