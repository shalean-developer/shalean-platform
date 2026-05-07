import "server-only";

import { pickAvailableCleaner } from "@/lib/booking/pickAvailableCleaner";
import { ensureBookingAssignment } from "@/lib/dispatch/ensureBookingAssignment";
import { notifyCleanerAssignedBooking } from "@/lib/dispatch/notifyCleanerAssigned";
import { CLEANER_RESPONSE } from "@/lib/dispatch/cleanerResponseStatus";
import type { SupabaseClient } from "@supabase/supabase-js";
import { serviceCapabilityGateFromBookingFields } from "@/lib/booking/serviceCapabilityEligibility";

const BOOKING_ROW_SELECT =
  "id, customer_name, customer_phone, location, service, date, time, status, created_at, cleaner_id, dispatch_status";

/**
 * After a dispatch offer is declined on WhatsApp: try to assign another cleaner via the standard dispatch path.
 * Safe when the booking is already assigned or not dispatchable (no-op / no harmful side effects beyond metrics).
 */
export async function reassignBookingAfterDecline(admin: SupabaseClient, bookingId: string): Promise<void> {
  await ensureBookingAssignment(admin, bookingId, {
    source: "whatsapp_offer_decline",
    retryEscalation: 1,
  });
}

/**
 * One immediate reassignment attempt after a cleaner declines (excludes decliner).
 * DB update is awaited; assignment SMS runs via `notifyCleanerAssignedBooking` (fire-and-forget). Never throws.
 */
export async function tryOnceReassignAfterDecline(
  admin: SupabaseClient,
  params: {
    bookingId: string;
    slotDate: string;
    slotTime: string;
    declinedCleanerId: string;
  },
): Promise<void> {
  try {
    const { data: svcRow } = await admin
      .from("bookings")
      .select("service_slug, service")
      .eq("id", params.bookingId)
      .maybeSingle();
    const sr = svcRow as { service_slug?: string | null; service?: string | null } | null;
    const gate = serviceCapabilityGateFromBookingFields(
      sr?.service_slug != null ? String(sr.service_slug) : null,
      sr?.service != null ? String(sr.service) : null,
    );
    const cleaner = await pickAvailableCleaner(admin, params.slotDate, params.slotTime, [params.declinedCleanerId], {
      serviceCapabilityGate: gate,
    });
    if (!cleaner) return;

    const nowIso = new Date().toISOString();
    const { data, error } = await admin
      .from("bookings")
      .update({
        cleaner_id: cleaner.id,
        status: "assigned",
        dispatch_status: "assigned",
        assigned_at: nowIso,
        cleaner_response_status: CLEANER_RESPONSE.PENDING,
        en_route_at: null,
        started_at: null,
        last_declined_by_cleaner_id: null,
        last_declined_at: null,
      })
      .eq("id", params.bookingId)
      .eq("status", "pending_assignment")
      .is("cleaner_id", null)
      .select(BOOKING_ROW_SELECT)
      .maybeSingle();

    if (error || !data) {
      if (error) {
        console.error("[reassignAfterDecline] assignment update failed", {
          bookingId: params.bookingId,
          message: error.message,
          code: error.code,
        });
      }
      return;
    }

    void notifyCleanerAssignedBooking(admin, params.bookingId, cleaner.id);
  } catch (err) {
    console.error("[reassignAfterDecline] unexpected error", {
      bookingId: params.bookingId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
