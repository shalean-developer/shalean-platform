import { emitToCleaner } from "@/lib/socket/server";

const EVENT = "NEW_JOB";

/**
 * Fire-and-forget push on optional Socket.IO layer (custom Node host).
 * Supabase Realtime already propagates `bookings` row changes to subscribed cleaners.
 */
export function signalJobAssignedRealtime(cleanerId: string, bookingId: string): void {
  emitToCleaner(cleanerId, EVENT, {
    bookingId,
    timestamp: new Date().toISOString(),
  });
}
