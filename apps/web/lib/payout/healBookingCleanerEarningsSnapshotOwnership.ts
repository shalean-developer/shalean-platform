import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { reportOperationalIssue } from "@/lib/logging/systemLog";
import {
  parseBookingEarningsSummary,
  remapEarningsSummaryCleanerId,
} from "@/lib/payout/bookingEarningsSummary";

/**
 * When assignment changes after a pre-completion snapshot was written, the early-skip path in
 * `persistCleanerPayoutIfUnset` can leave `booking_cleaner_earnings_snapshot.cleaner_id` (and
 * `bookings.earnings_summary` participant ids) pointing at a prior assignee. Heal ownership to
 * the authoritative persist cleaner without rewriting earnings amounts.
 */
export async function healBookingCleanerEarningsSnapshotOwnershipIfNeeded(params: {
  admin: SupabaseClient;
  bookingId: string;
  expectedCleanerId: string;
}): Promise<{ healed: boolean; previousCleanerId?: string | null }> {
  const bookingId = String(params.bookingId ?? "").trim();
  const expectedCleanerId = String(params.expectedCleanerId ?? "").trim();
  if (!bookingId || !expectedCleanerId) return { healed: false };

  const { data: snap, error } = await params.admin
    .from("booking_cleaner_earnings_snapshot")
    .select("booking_id, cleaner_id")
    .eq("booking_id", bookingId)
    .maybeSingle();
  if (error) {
    void reportOperationalIssue("warn", "healBookingCleanerEarningsSnapshotOwnership", error.message, {
      bookingId,
      cleanerId: expectedCleanerId,
    });
    return { healed: false };
  }

  let previous: string | null = null;
  let healed = false;

  if (snap) {
    previous = String((snap as { cleaner_id?: string | null }).cleaner_id ?? "").trim() || null;
    if (previous && previous !== expectedCleanerId) {
      const { error: upErr } = await params.admin
        .from("booking_cleaner_earnings_snapshot")
        .update({ cleaner_id: expectedCleanerId, updated_at: new Date().toISOString() })
        .eq("booking_id", bookingId)
        .eq("cleaner_id", previous);
      if (upErr) {
        void reportOperationalIssue("warn", "healBookingCleanerEarningsSnapshotOwnership", upErr.message, {
          bookingId,
          cleanerId: expectedCleanerId,
          previousCleanerId: previous,
        });
      } else {
        healed = true;
      }
    }
  }

  const { data: bookingRow } = await params.admin
    .from("bookings")
    .select("earnings_summary")
    .eq("id", bookingId)
    .maybeSingle();
  const summary = parseBookingEarningsSummary(
    (bookingRow as { earnings_summary?: unknown } | null)?.earnings_summary,
  );
  if (summary && previous && previous !== expectedCleanerId) {
    const remapped = remapEarningsSummaryCleanerId(summary, previous, expectedCleanerId);
    if (remapped) {
      const { error: sumErr } = await params.admin
        .from("bookings")
        .update({ earnings_summary: remapped })
        .eq("id", bookingId);
      if (sumErr) {
        void reportOperationalIssue("warn", "healBookingCleanerEarningsSnapshotOwnership", sumErr.message, {
          bookingId,
          cleanerId: expectedCleanerId,
          previousCleanerId: previous,
          phase: "earnings_summary",
        });
      } else {
        healed = true;
      }
    }
  } else if (summary) {
    // Snapshot may already match; still heal summary if it lists a non-expected solo owner.
    const drifted = summary.per_cleaner_earnings.find((row) => row.cleaner_id !== expectedCleanerId);
    if (drifted && summary.per_cleaner_earnings.length === 1) {
      const remapped = remapEarningsSummaryCleanerId(summary, drifted.cleaner_id, expectedCleanerId);
      if (remapped) {
        previous = drifted.cleaner_id;
        const { error: sumErr } = await params.admin
          .from("bookings")
          .update({ earnings_summary: remapped })
          .eq("id", bookingId);
        if (!sumErr) healed = true;
      }
    }
  }

  if (healed) {
    void reportOperationalIssue(
      "warn",
      "healBookingCleanerEarningsSnapshotOwnership",
      "snapshot_cleaner_ownership_healed",
      {
        bookingId,
        cleanerId: expectedCleanerId,
        previousCleanerId: previous,
      },
    );
  }
  return { healed, previousCleanerId: previous };
}
