import "server-only";

import { terminalStatusesNotInDuplicateProbe } from "@/lib/booking/bookingTerminalStatuses";

/**
 * Active-slot filters for the same customer calendar slot as duplicate probe, race RPC, and invariant checks.
 * Must stay aligned with `public.booking_matches_active_admin_slot` in Supabase migrations.
 */
export type ActiveAdminBookingSlotParams = {
  userId: string;
  date: string;
  timeHm: string;
  serviceSlug: string;
};

/**
 * Chains `.eq` / `.not` on a PostgREST `bookings` query for the active admin slot definition.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function applyActiveAdminBookingSlotFilters(query: any, p: ActiveAdminBookingSlotParams): any {
  return query
    .eq("user_id", p.userId)
    .eq("date", p.date)
    .eq("time", p.timeHm)
    .eq("service_slug", p.serviceSlug)
    .not("status", "in", terminalStatusesNotInDuplicateProbe());
}
