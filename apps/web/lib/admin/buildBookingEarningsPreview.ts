import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { buildAdminEarningsDisplayForBooking, computeLiveBookingEarningsSummary } from "@/lib/admin/adminBookingEarningsDisplay";
import type { AdminEarningsDisplay } from "@/lib/payout/bookingEarningsSummary";
import { parseBookingEarningsSummary, type BookingEarningsSummary } from "@/lib/payout/bookingEarningsSummary";

export type BookingEarningsPreview = {
  current: {
    display_earnings_cents: number | null;
    cleaner_earnings_total_cents: number | null;
    earnings_summary: BookingEarningsSummary | null;
  };
  computed_preview: BookingEarningsSummary | null;
  earnings_display: AdminEarningsDisplay | null;
  preview_unavailable_reason?: string;
};

function roundCents(n: unknown): number | null {
  if (n == null || n === "") return null;
  const v = Math.round(Number(n));
  return Number.isFinite(v) ? v : null;
}

/**
 * Read-only v3 earnings preview from the canonical engine.
 * Does not mutate bookings or payout rows.
 */
export async function buildBookingEarningsPreview(
  admin: SupabaseClient,
  bookingId: string,
): Promise<{ ok: true; preview: BookingEarningsPreview } | { ok: false; error: string }> {
  const bid = bookingId.trim();
  if (!/^[0-9a-f-]{36}$/i.test(bid)) {
    return { ok: false, error: "Invalid booking id." };
  }

  const { data: b, error: bErr } = await admin
    .from("bookings")
    .select(
      "id, is_team_job, display_earnings_cents, cleaner_earnings_total_cents, cleaner_id, payout_owner_cleaner_id, team_id, base_amount_cents, service_fee_cents, total_paid_zar, total_paid_cents, amount_paid_cents, service, booking_snapshot, date, time, price_snapshot, earnings_summary",
    )
    .eq("id", bid)
    .maybeSingle();
  if (bErr || !b) {
    return { ok: false, error: bErr?.message ?? "Booking not found." };
  }

  const storedSummary = parseBookingEarningsSummary((b as { earnings_summary?: unknown }).earnings_summary);
  const earningsDisplay = await buildAdminEarningsDisplayForBooking(admin, b);

  let computedPreview: BookingEarningsSummary | null = null;
  try {
    computedPreview = await computeLiveBookingEarningsSummary(admin, bid, b);
  } catch {
    computedPreview = null;
  }

  return {
    ok: true,
    preview: {
      current: {
        display_earnings_cents: roundCents((b as { display_earnings_cents?: unknown }).display_earnings_cents),
        cleaner_earnings_total_cents: roundCents(
          (b as { cleaner_earnings_total_cents?: unknown }).cleaner_earnings_total_cents,
        ),
        earnings_summary: storedSummary,
      },
      computed_preview: computedPreview,
      earnings_display: earningsDisplay,
      preview_unavailable_reason: computedPreview ? undefined : "compute_failed",
    },
  };
}
