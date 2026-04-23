import type { SupabaseClient } from "@supabase/supabase-js";
import { CLEANER_RESPONSE } from "@/lib/dispatch/cleanerResponseStatus";

export { PENDING_ACK_ESCALATE_MS, escalateBookingIfAckTimeout } from "@/lib/dispatch/escalatePendingAck";

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export type PollAckResult = "accepted" | "declined" | "timeout" | "db_error";

/**
 * Polls `bookings.cleaner_response_status` (for long-running workers / scripts — not Vercel HTTP).
 * Cron-based escalation uses {@link escalateBookingIfAckTimeout} instead of blocking waits.
 */
export async function pollCleanerAck(
  admin: SupabaseClient,
  bookingId: string,
  options?: { maxMs?: number; intervalMs?: number },
): Promise<PollAckResult> {
  const maxMs = options?.maxMs ?? 30_000;
  const intervalMs = options?.intervalMs ?? 3_000;
  const deadline = Date.now() + maxMs;

  while (Date.now() < deadline) {
    const { data, error } = await admin
      .from("bookings")
      .select("cleaner_response_status")
      .eq("id", bookingId)
      .maybeSingle();

    if (error) return "db_error";
    const raw = data && typeof data === "object" ? (data as { cleaner_response_status?: string | null }).cleaner_response_status : null;
    const r = String(raw ?? "").toLowerCase();
    if (r === CLEANER_RESPONSE.ACCEPTED) return "accepted";
    if (r === CLEANER_RESPONSE.DECLINED || r === CLEANER_RESPONSE.TIMEOUT) return "declined";
    await sleep(intervalMs);
  }
  return "timeout";
}
