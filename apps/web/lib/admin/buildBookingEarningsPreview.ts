import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { bookingCleanerShareOrFallback } from "@/lib/payout/cleanerLineEarningsConfig";
import { resolveEffectiveLineCleanerSharePercentageForBooking } from "@/lib/payout/tenureBasedCleanerLineShare";

export type BookingEarningsPreview = {
  current: {
    display_earnings_cents: number | null;
    cleaner_earnings_total_cents: number | null;
    line_items_count: number;
  };
  computed_preview: {
    cleaner_earnings_total_cents: number;
    diff_cents: number;
  } | null;
  /** When set, `computed_preview` is omitted (e.g. team jobs). */
  preview_unavailable_reason?: string;
};

function roundCents(n: unknown): number | null {
  if (n == null || n === "") return null;
  const v = Math.round(Number(n));
  return Number.isFinite(v) ? v : null;
}

/**
 * Read-only line-ledger total (same formula as {@link computeCleanerEarningsForBooking}) for solo bookings.
 * Does not mutate `booking_line_items` or `bookings`.
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
    .select("id, is_team_job, display_earnings_cents, cleaner_earnings_total_cents, cleaner_share_percentage, cleaner_id, date, time")
    .eq("id", bid)
    .maybeSingle();
  if (bErr || !b) {
    return { ok: false, error: bErr?.message ?? "Booking not found." };
  }

  const isTeam = (b as { is_team_job?: boolean | null }).is_team_job === true;
  const display = roundCents((b as { display_earnings_cents?: unknown }).display_earnings_cents);
  const lineTotalStored = roundCents((b as { cleaner_earnings_total_cents?: unknown }).cleaner_earnings_total_cents);

  const { data: lines, error: liErr } = await admin
    .from("booking_line_items")
    .select("id, earns_cleaner, total_price_cents")
    .eq("booking_id", bid);
  if (liErr) {
    return { ok: false, error: liErr.message };
  }
  const items = lines ?? [];
  const line_items_count = items.length;

  if (isTeam) {
    return {
      ok: true,
      preview: {
        current: {
          display_earnings_cents: display,
          cleaner_earnings_total_cents: lineTotalStored,
          line_items_count,
        },
        computed_preview: null,
        preview_unavailable_reason: "team_job",
      },
    };
  }

  if (items.length === 0) {
    return {
      ok: true,
      preview: {
        current: {
          display_earnings_cents: display,
          cleaner_earnings_total_cents: lineTotalStored,
          line_items_count: 0,
        },
        computed_preview: null,
        preview_unavailable_reason: "no_line_items",
      },
    };
  }

  const soloCleanerId = String((b as { cleaner_id?: string | null }).cleaner_id ?? "").trim();
  const share =
    /^[0-9a-f-]{36}$/i.test(soloCleanerId)
      ? await resolveEffectiveLineCleanerSharePercentageForBooking(admin, {
          bookingId: bid,
          cleanerId: soloCleanerId,
          row: b as {
            cleaner_share_percentage?: unknown;
            date?: string | null;
            time?: string | null;
          },
          logSource: "buildBookingEarningsPreview",
        })
      : bookingCleanerShareOrFallback((b as { cleaner_share_percentage?: unknown }).cleaner_share_percentage, {
          bookingId: bid,
          logSource: "buildBookingEarningsPreview",
        });
  let previewTotal = 0;
  for (const raw of items) {
    const li = raw as { id?: string; earns_cleaner?: boolean | null; total_price_cents?: number | null };
    const id = String(li.id ?? "");
    if (!/^[0-9a-f-]{36}$/i.test(id)) continue;
    const earns = li.earns_cleaner !== false;
    const cents = Math.max(0, Math.round(Number(li.total_price_cents) || 0));
    previewTotal += earns ? Math.round(cents * share) : 0;
  }

  const baseline =
    lineTotalStored != null && lineTotalStored >= 0
      ? lineTotalStored
      : display != null && display >= 0
        ? display
        : 0;
  const diff_cents = previewTotal - baseline;

  return {
    ok: true,
    preview: {
      current: {
        display_earnings_cents: display,
        cleaner_earnings_total_cents: lineTotalStored,
        line_items_count,
      },
      computed_preview: {
        cleaner_earnings_total_cents: previewTotal,
        diff_cents,
      },
    },
  };
}
