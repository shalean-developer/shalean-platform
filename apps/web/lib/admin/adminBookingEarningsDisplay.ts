import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  parseBookingEarningsSummary,
  resolveAdminEarningsDisplay,
  type AdminEarningsDisplay,
} from "@/lib/payout/bookingEarningsSummary";
import { resolveBookingCanonicalPayout } from "@/lib/payout/resolveBookingCanonicalPayout";
import type { BookingEarningsSummary } from "@/lib/payout/bookingEarningsSummary";

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
  const canonical = await resolveBookingCanonicalPayout(admin, {
    bookingId,
    row,
    computedAtIso: new Date().toISOString(),
  });
  return canonical.earningsSummary;
}
