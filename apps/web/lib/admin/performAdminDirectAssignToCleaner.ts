import type { SupabaseClient } from "@supabase/supabase-js";
import { setAdminManualBookingDirectAssigned } from "@/lib/admin/adminManualDirectAssignCommand";
import type { AdminAssignOneResult } from "@/lib/admin/performAdminAssignToCleaner";
import type { AdminWarning } from "@/lib/admin/adminWarningPayload";
import { triggerAssignmentEarningsSnapshotForBooking } from "@/lib/admin/triggerAssignmentEarningsSnapshot";
import { validateAdminManualAssignToCleaner } from "@/lib/admin/validateAdminManualAssignToCleaner";
import { logAssignmentSuccess } from "@/lib/booking/verifyBookingAssignment";
import { syncCleanerBusyFromBookings } from "@/lib/cleaner/syncCleanerStatus";
import { assignmentTruthPatchForOfferAccept } from "@/lib/dispatch/assignmentTruth";
import { notifyCleanerAssignedBooking } from "@/lib/dispatch/notifyCleanerAssigned";
import { marketplaceBookingPatchOnAssign } from "@/lib/marketplace-intelligence/marketplaceBookingMeta";
import { logSystemEvent } from "@/lib/logging/systemLog";

export type AdminDirectAssignOneResult =
  | {
      ok: true;
      cleanerId: string;
      alreadyAssigned?: boolean;
      warnings?: AdminWarning[];
    }
  | Extract<AdminAssignOneResult, { ok: false }>;

/**
 * Admin assigns a solo cleaner immediately (no dispatch offer). Notifies the cleaner via the assigned flow.
 */
export async function performAdminDirectAssignToCleaner(
  admin: SupabaseClient,
  params: { bookingId: string; cleanerId: string; force: boolean },
): Promise<AdminDirectAssignOneResult> {
  const { bookingId, force } = params;
  const validation = await validateAdminManualAssignToCleaner(admin, params);
  if (!validation.ok) return validation;

  const { booking: b, resolvedCleanerId, prevCleaner, warnings } = validation;
  const prevCleanerId = prevCleaner ? String(prevCleaner).trim() || null : null;
  const st = String(b.status ?? "").toLowerCase();

  if (prevCleanerId === resolvedCleanerId && st === "assigned") {
    return {
      ok: true,
      cleanerId: resolvedCleanerId,
      alreadyAssigned: true,
      ...(warnings.length > 0 ? { warnings } : {}),
    };
  }

  const { data: bookingMeta } = await admin
    .from("bookings")
    .select("date, time, location_id, city_id, assignment_type, selected_cleaner_id")
    .eq("id", bookingId)
    .maybeSingle();

  const metaRow = bookingMeta as {
    date?: string | null;
    time?: string | null;
    location_id?: string | null;
    city_id?: string | null;
    assignment_type?: string | null;
    selected_cleaner_id?: string | null;
  } | null;

  const assignMeta = await marketplaceBookingPatchOnAssign(admin, {
    date: metaRow?.date ?? b.date ?? null,
    time: metaRow?.time ?? b.time ?? null,
    location_id: metaRow?.location_id ?? b.location_id ?? null,
    city_id: metaRow?.city_id ?? b.city_id ?? null,
  });

  const truthPatch = {
    ...assignmentTruthPatchForOfferAccept({
      acceptedCleanerId: resolvedCleanerId,
      assignmentTypeBefore: metaRow?.assignment_type,
      selectedCleanerId: metaRow?.selected_cleaner_id,
    }),
    assignment_type: "admin_assigned",
  };

  const nowIso = new Date().toISOString();
  const committed = await setAdminManualBookingDirectAssigned({
    admin,
    bookingId,
    cleanerId: resolvedCleanerId,
    nowIso,
    prevCleanerId,
    assignMeta,
    truthPatch,
  });

  if (!committed.ok) {
    return { ok: false, httpStatus: 500, error: committed.error };
  }

  await syncCleanerBusyFromBookings(admin, resolvedCleanerId);
  if (prevCleanerId && prevCleanerId !== resolvedCleanerId) {
    await syncCleanerBusyFromBookings(admin, prevCleanerId);
  }

  await triggerAssignmentEarningsSnapshotForBooking(admin, bookingId, "performAdminDirectAssignToCleaner");

  void logSystemEvent({
    level: "info",
    source: "admin_direct_assign",
    message: "booking_assigned_direct",
    context: { bookingId, cleanerId: resolvedCleanerId, force },
  });

  logAssignmentSuccess({ bookingId, cleanerId: resolvedCleanerId, source: "performAdminDirectAssignToCleaner" });
  void notifyCleanerAssignedBooking(admin, bookingId, resolvedCleanerId);

  return {
    ok: true,
    cleanerId: resolvedCleanerId,
    ...(warnings.length > 0 ? { warnings } : {}),
  };
}
