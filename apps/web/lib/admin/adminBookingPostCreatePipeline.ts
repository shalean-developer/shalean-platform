import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { logSystemEvent, reportOperationalIssue } from "@/lib/logging/systemLog";
import {
  resolvePersistCleanerIdForBooking,
  type BookingPersistIdsRow,
} from "@/lib/payout/bookingEarningsIntegrity";
import { persistCleanerPayoutIfUnset } from "@/lib/payout/persistCleanerPayout";

/**
 * When a preferred cleaner was chosen (`selected_cleaner_id`), align `cleaner_id` and move
 * operational `pending` → `assigned` so cleaner lifecycle CTAs apply. Skips completed/cancelled/etc.
 */
export async function normalizeAdminBookingCleanerFromPreferred(
  admin: SupabaseClient,
  bookingId: string,
): Promise<void> {
  const { data: r, error } = await admin
    .from("bookings")
    .select("cleaner_id, selected_cleaner_id, status, assigned_at")
    .eq("id", bookingId)
    .maybeSingle();
  if (error || !r) return;
  const selected = String((r as { selected_cleaner_id?: string | null }).selected_cleaner_id ?? "").trim();
  if (!selected || !/^[0-9a-f-]{36}$/i.test(selected)) return;

  const st = String((r as { status?: string | null }).status ?? "")
    .trim()
    .toLowerCase();
  const assignedRaw = (r as { assigned_at?: string | null }).assigned_at;
  const hasAssignedAt = typeof assignedRaw === "string" && assignedRaw.trim() !== "";

  const patch: Record<string, unknown> = { cleaner_id: selected };
  if (st === "pending") {
    patch.status = "assigned";
    if (!hasAssignedAt) patch.assigned_at = new Date().toISOString();
  }

  await admin.from("bookings").update(patch).eq("id", bookingId);
}

/**
 * Runs `persistCleanerPayoutIfUnset` only when the booking is already `completed`
 * (line-level earnings + ledger are handled inside that path).
 */
export async function triggerPersistCleanerPayoutIfCompleted(
  admin: SupabaseClient,
  bookingId: string,
  logSource: string,
): Promise<void> {
  const { data: b, error } = await admin
    .from("bookings")
    .select("status, cleaner_id, payout_owner_cleaner_id, is_team_job")
    .eq("id", bookingId)
    .maybeSingle();
  if (error || !b) {
    void reportOperationalIssue("warn", logSource, error?.message ?? "booking_missing", { bookingId });
    return;
  }
  const st = String((b as { status?: string | null }).status ?? "").toLowerCase();
  if (st !== "completed") {
    void logSystemEvent({
      level: "info",
      source: logSource,
      message: "earnings_skipped_status_not_completed",
      context: { bookingId, status: st || null },
    });
    return;
  }
  const cleanerId = resolvePersistCleanerIdForBooking(b as BookingPersistIdsRow);
  if (!cleanerId) {
    void logSystemEvent({
      level: "warn",
      source: logSource,
      message: "earnings_skipped_no_cleaner_for_payout",
      context: { bookingId },
    });
    return;
  }
  void logSystemEvent({
    level: "info",
    source: logSource,
    message: "earnings_trigger_persist_cleaner_payout",
    context: { bookingId, cleanerId },
  });
  const payout = await persistCleanerPayoutIfUnset({ admin, bookingId, cleanerId });
  if (!payout.ok) {
    void reportOperationalIssue("warn", logSource, payout.error ?? "persistCleanerPayoutIfUnset failed", {
      bookingId,
      cleanerId,
    });
  }
}

export async function runAdminBookingPostCreateNormalizationAndEarnings(
  admin: SupabaseClient,
  bookingId: string,
  logSource: string,
): Promise<void> {
  await normalizeAdminBookingCleanerFromPreferred(admin, bookingId);
  await triggerPersistCleanerPayoutIfCompleted(admin, bookingId, logSource);
}
