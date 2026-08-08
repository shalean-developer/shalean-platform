import type { SupabaseClient } from "@supabase/supabase-js";
import { syncCleanerBusyFromBookings } from "@/lib/cleaner/syncCleanerStatus";
import { setAdminManualBookingOffered } from "@/lib/admin/adminManualBookingOfferCommand";
import { resolveDispatchOfferAcceptTtlSeconds } from "@/lib/dispatch/dispatchOfferAcceptTtl";
import { createDispatchOfferRow } from "@/lib/dispatch/dispatchOffers";
import type { AdminWarning } from "@/lib/admin/adminWarningPayload";
import { validateAdminManualAssignToCleaner } from "@/lib/admin/validateAdminManualAssignToCleaner";
import type { DailyWorkloadWarning } from "@/lib/booking/cleanerDailyWorkloadShadow";

export type AdminAssignOneResult =
  | {
      ok: true;
      cleanerId: string;
      offerId: string;
      expiresAtIso: string;
      workloadWarning?: DailyWorkloadWarning | null;
      workloadOverrideCode?: "admin_daily_workload_over_limit_force_override";
      workloadOverrideReason?: string;
      warnings?: AdminWarning[];
    }
  | {
      ok: false;
      httpStatus: number;
      error: string;
      code?: "admin_daily_workload_over_limit";
      workloadWarning?: DailyWorkloadWarning | null;
      warnings?: AdminWarning[];
    };

/**
 * Admin dispatch: validate slot + city, then reset booking to pending/offered and create a dispatch offer.
 * `cleanerId` must be `cleaners.id` (not auth user id).
 */
export async function performAdminAssignToCleaner(
  admin: SupabaseClient,
  params: { bookingId: string; cleanerId: string; force: boolean },
): Promise<AdminAssignOneResult> {
  const { bookingId, force } = params;

  // Preserve the established eligibility/override contract first. This keeps account-state,
  // slot, city and workload failures authoritative and avoids a separate preflight query
  // changing their public error semantics.
  const validation = await validateAdminManualAssignToCleaner(admin, params);
  if (!validation.ok) return validation;

  const { booking: b, resolvedCleanerId, prevCleaner, workloadWarning, warnings } = validation;

  // Individual-cleaner offers must never silently dismantle a team assignment. Team jobs
  // have roster/member payout state outside the booking row, so clearing only booking.team_id
  // would create split assignment truth and could later duplicate earnings. Require the
  // explicit team-management flow to remove/replace the team first. This check runs after
  // canonical validation but before any booking or offer write.
  const { data: assignmentHead, error: assignmentHeadError } = await admin
    .from("bookings")
    .select("team_id, is_team_job")
    .eq("id", bookingId)
    .maybeSingle();
  if (assignmentHeadError) {
    return { ok: false, httpStatus: 500, error: assignmentHeadError.message };
  }
  if (
    assignmentHead &&
    ((assignmentHead as { is_team_job?: boolean | null }).is_team_job === true ||
      Boolean(String((assignmentHead as { team_id?: string | null }).team_id ?? "").trim()))
  ) {
    return {
      ok: false,
      httpStatus: 409,
      error: "Booking has a team assignment. Remove or replace the team before offering the booking to an individual cleaner.",
    };
  }

  const dispatchWasUnassignable = String(b.dispatch_status ?? "").toLowerCase() === "unassignable";
  const nowIsoForPending = new Date().toISOString();

  const offered = await setAdminManualBookingOffered({
    admin,
    bookingId,
    dispatchWasUnassignable,
    nowIsoForPending,
  });

  if (!offered.ok) {
    return { ok: false, httpStatus: 500, error: offered.error };
  }

  await admin
    .from("dispatch_offers")
    .update({ status: "expired", responded_at: nowIsoForPending })
    .eq("booking_id", bookingId)
    .eq("status", "pending");

  const offer = await createDispatchOfferRow({
    supabase: admin,
    bookingId,
    cleanerId: resolvedCleanerId,
    rankIndex: 0,
    ttlSeconds: resolveDispatchOfferAcceptTtlSeconds(),
  });
  if (!offer.ok) {
    if (process.env.NODE_ENV !== "production") {
      console.error("[performAdminAssignToCleaner] createDispatchOfferRow failed", {
        bookingId,
        cleanerId: resolvedCleanerId,
        error: offer.error,
      });
    }
    return { ok: false, httpStatus: 500, error: offer.error || "Could not create offer." };
  }

  if (prevCleaner && prevCleaner !== resolvedCleanerId) {
    await syncCleanerBusyFromBookings(admin, prevCleaner);
  }

  return {
    ok: true,
    cleanerId: resolvedCleanerId,
    offerId: offer.offerId,
    expiresAtIso: offer.expiresAtIso,
    workloadWarning,
    ...(warnings.length > 0 ? { warnings } : {}),
    ...(force && workloadWarning?.code === "daily_workload_over_limit"
      ? {
          workloadOverrideCode: "admin_daily_workload_over_limit_force_override" as const,
          workloadOverrideReason: "Admin force override allowed assignment above the 8-hour daily workload policy.",
        }
      : {}),
  };
}