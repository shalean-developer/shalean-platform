import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  parseBookingEarningsSummary,
  resolveAdminEarningsDisplay,
  type AdminEarningsDisplay,
} from "@/lib/payout/bookingEarningsSummary";
import { resolveBookingCanonicalPayout } from "@/lib/payout/resolveBookingCanonicalPayout";
import type { BookingEarningsSummary } from "@/lib/payout/bookingEarningsSummary";
import { sumEligibleLineItemsSubtotalCents } from "@/lib/payout/computeEarningsFromLineItems";
import { isCurrentPayoutVisitDate } from "@/lib/payout/payoutProcessingCutoff";

export async function buildAdminEarningsDisplayForBooking(
  admin: SupabaseClient,
  booking: { earnings_summary?: unknown; id?: string | null },
): Promise<AdminEarningsDisplay | null> {
  const summary = parseBookingEarningsSummary(booking.earnings_summary);
  if (!summary) return null;

  const ids = summary.per_cleaner_earnings.map((r) => r.cleaner_id).filter(Boolean);
  const nameMap = new Map<string, string>();
  if (ids.length > 0) {
    const { data } = await admin.from("cleaners").select("id, full_name").in("id", ids);
    for (const row of data ?? []) {
      const id = String((row as { id?: string }).id ?? "").trim();
      const name = String((row as { full_name?: string | null }).full_name ?? "").trim();
      if (id) nameMap.set(id, name || id);
    }
  }

  return resolveAdminEarningsDisplay(summary, nameMap);
}

export async function computeLiveBookingEarningsSummary(
  admin: SupabaseClient,
  bookingId: string,
  row: Parameters<typeof resolveBookingCanonicalPayout>[1]["row"],
): Promise<BookingEarningsSummary | null> {
  let eligibleAmountCents: number | undefined;
  if (row.is_team_job !== true && isCurrentPayoutVisitDate(row.date)) {
    const { data: lines, error } = await admin
      .from("booking_line_items")
      .select("id, item_type, slug, name, metadata, earns_cleaner, total_price_cents")
      .eq("booking_id", bookingId);
    if (error) throw new Error("Could not verify booking earnings line items");

    // Recompute prefers eligible service lines in cents. Legacy price snapshots
    // can store ZAR values, so the preview must use the same verified line basis.
    const subtotal = sumEligibleLineItemsSubtotalCents(lines ?? []);
    if (subtotal > 0) eligibleAmountCents = subtotal;
  }

  const canonical = await resolveBookingCanonicalPayout(admin, {
    bookingId,
    row,
    eligibleAmountCents,
    computedAtIso: new Date().toISOString(),
  });
  return canonical.earningsSummary;
}
