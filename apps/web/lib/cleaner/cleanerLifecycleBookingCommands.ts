import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { CLEANER_LIFECYCLE_CODE } from "@/lib/cleaner/cleanerLifecycleErrors";
import { isAssignableForCleanerLifecycleStatus } from "@/lib/cleaner/cleanerBookingLifecycleStatuses";

export type CleanerLifecycleUpdateError = { message: string; code?: string };

/**
 * Accept-related writes: re-read `status`, then update by `id` only.
 * This preserves the existing guard against PostgREST 0-row success after
 * the row leaves the assignable set between read and write.
 */
export async function updateAssignableCleanerLifecycleBookingOrFail(params: {
  admin: SupabaseClient;
  bookingId: string;
  patch: Record<string, unknown>;
}): Promise<{ ok: true } | { ok: false; message: string; code: string }> {
  const { data: cur, error: selErr } = await params.admin
    .from("bookings")
    .select("id,status")
    .eq("id", params.bookingId)
    .maybeSingle();
  if (selErr) {
    return { ok: false, message: selErr.message, code: "accept_persist_failed" };
  }
  if (!cur) {
    return { ok: false, message: "Booking not found.", code: "accept_persist_failed" };
  }
  const curSt = String((cur as { status?: string | null }).status ?? "")
    .trim()
    .toLowerCase();
  if (!isAssignableForCleanerLifecycleStatus(curSt)) {
    return {
      ok: false,
      message: "Could not save — this job is no longer in an assignable state. Refresh the page and try again.",
      code: CLEANER_LIFECYCLE_CODE.BOOKING_STATE_CHANGED,
    };
  }
  const { data, error } = await params.admin.from("bookings").update(params.patch).eq("id", params.bookingId).select("id");
  if (error) {
    return { ok: false, message: error.message, code: "accept_persist_failed" };
  }
  if (!data?.length) {
    return {
      ok: false,
      message: "Could not save acceptance — the booking changed or was updated elsewhere. Refresh the page and try again.",
      code: CLEANER_LIFECYCLE_CODE.ACCEPT_UPDATE_NO_ROW,
    };
  }
  return { ok: true };
}

export async function updateRecurringPendingPaymentCleanerLifecycleBooking(params: {
  admin: SupabaseClient;
  bookingId: string;
  patch: Record<string, unknown>;
}): Promise<{ data: Array<{ id: string }> | null; error: CleanerLifecycleUpdateError | null }> {
  const { data, error } = await params.admin
    .from("bookings")
    .update(params.patch)
    .eq("id", params.bookingId)
    .eq("status", "pending_payment")
    .select("id");

  return { data: data as Array<{ id: string }> | null, error };
}

export async function updateCleanerLifecycleBookingState(params: {
  admin: SupabaseClient;
  bookingId: string;
  patch: Record<string, unknown>;
}): Promise<{ error: CleanerLifecycleUpdateError | null }> {
  const { error } = await params.admin.from("bookings").update(params.patch).eq("id", params.bookingId);
  return { error };
}
