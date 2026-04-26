import "server-only";

import { triggerWhatsAppNotification, type CreatedBookingRecord } from "@/lib/booking/triggerWhatsAppNotification";
import { pickAvailableCleaner } from "@/lib/booking/pickAvailableCleaner";
import type { SupabaseClient } from "@supabase/supabase-js";

const BOOKING_ROW_SELECT =
  "id, customer_name, customer_phone, location, service, date, time, status, created_at, cleaner_id, dispatch_status";

/**
 * One immediate reassignment attempt after a cleaner declines (excludes decliner).
 * DB update is awaited; WhatsApp to the new cleaner is fire-and-forget. Never throws.
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
    const cleaner = await pickAvailableCleaner(admin, params.slotDate, params.slotTime, [params.declinedCleanerId]);
    if (!cleaner) return;

    const nowIso = new Date().toISOString();
    const { data, error } = await admin
      .from("bookings")
      .update({
        cleaner_id: cleaner.id,
        status: "assigned",
        dispatch_status: "assigned",
        assigned_at: nowIso,
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

    void triggerWhatsAppNotification(data as CreatedBookingRecord, {
      recipientPhone: cleaner.phone,
      variant: "cleaner_job_assigned",
    });
  } catch (err) {
    console.error("[reassignAfterDecline] unexpected error", {
      bookingId: params.bookingId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
