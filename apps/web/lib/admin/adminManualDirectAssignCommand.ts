import type { SupabaseClient } from "@supabase/supabase-js";
import { CLEANER_RESPONSE } from "@/lib/dispatch/cleanerResponseStatus";
import type { MarketplaceBookingAssignPatch } from "@/lib/marketplace-intelligence/marketplaceBookingMeta";
import { BOOKING_PAYOUT_COLUMNS_CLEAR } from "@/lib/payout/bookingPayoutColumns";

export type SetAdminManualBookingDirectAssignedParams = {
  admin: SupabaseClient;
  bookingId: string;
  cleanerId: string;
  nowIso: string;
  prevCleanerId: string | null;
  assignMeta: MarketplaceBookingAssignPatch;
  truthPatch: { assignment_type?: string; fallback_reason?: null };
};

/**
 * Admin assigns a solo cleaner without a dispatch offer: booking → assigned, pending offers expired.
 */
export async function setAdminManualBookingDirectAssigned(
  params: SetAdminManualBookingDirectAssignedParams,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { admin, bookingId, cleanerId, nowIso, prevCleanerId, assignMeta, truthPatch } = params;

  await admin
    .from("dispatch_offers")
    .update({ status: "expired", responded_at: nowIso })
    .eq("booking_id", bookingId)
    .eq("status", "pending");

  const patch: Record<string, unknown> = {
    cleaner_id: cleanerId,
    payout_owner_cleaner_id: cleanerId,
    status: "assigned",
    dispatch_status: "assigned",
    assigned_at: nowIso,
    accepted_at: nowIso,
    cleaner_response_status: CLEANER_RESPONSE.ACCEPTED,
    assignment_type: truthPatch.assignment_type ?? "admin_assigned",
    en_route_at: null,
    started_at: null,
    is_team_job: false,
    team_id: null,
    marketplace_cluster_id: assignMeta.marketplace_cluster_id,
    marketplace_forecast_demand: assignMeta.marketplace_forecast_demand,
    ...(prevCleanerId && prevCleanerId !== cleanerId ? BOOKING_PAYOUT_COLUMNS_CLEAR : {}),
  };

  if (truthPatch.fallback_reason === null) {
    patch.fallback_reason = null;
  }

  const { error } = await admin.from("bookings").update(patch).eq("id", bookingId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
