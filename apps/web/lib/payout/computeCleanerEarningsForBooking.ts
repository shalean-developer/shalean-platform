import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { reportOperationalIssue } from "@/lib/logging/systemLog";
import {
  allocateDisplayCentsAcrossLineItems,
  type EarningsLineItemInput,
} from "@/lib/payout/computeEarningsFromLineItems";
import { resolveEffectiveLineCleanerSharePercentageForBooking } from "@/lib/payout/tenureBasedCleanerLineShare";
import { useLegacyPayoutEngine } from "@/lib/payout/canonicalCleanerPayout";

export type ComputeCleanerEarningsForBookingResult =
  | { ok: true; skipped: true; reason: string }
  | { ok: true; skipped: false; total_cents: number; line_count: number }
  | { ok: false; error: string };

/**
 * Fills `booking_line_items.cleaner_earnings_cents` and sets `bookings.cleaner_earnings_total_cents`
 * + `cleaner_line_earnings_finalized_at` once.
 *
 * When `canonicalDisplayCents` is provided (default path), allocates that **exact** total across
 * eligible line weights — same number as `display_earnings_cents` / preview (no second formula).
 *
 * Legacy (`USE_LEGACY_PAYOUT_ENGINE=true` without canonical cents): prior `share × line total` math.
 */
export async function computeCleanerEarningsForBooking(params: {
  admin: SupabaseClient;
  bookingId: string;
  /** Solo assignment cleaner (must match booking for RLS-safe reads; not used in canonical formula). */
  cleanerId: string;
  /** Canonical cleaner display total to spread across lines; omit for legacy share path. */
  canonicalDisplayCents?: number | null;
}): Promise<ComputeCleanerEarningsForBookingResult> {
  const { admin, bookingId, cleanerId, canonicalDisplayCents } = params;
  const bid = bookingId.trim();
  if (!bid) return { ok: false, error: "Invalid booking id" };

  const { data: booking, error: bErr } = await admin
    .from("bookings")
    .select(
      "id, is_team_job, cleaner_line_earnings_finalized_at, cleaner_id, payout_owner_cleaner_id, cleaner_share_percentage, date, time",
    )
    .eq("id", bid)
    .maybeSingle();
  if (bErr || !booking) return { ok: false, error: bErr?.message ?? "Booking not found" };

  const row = booking as {
    is_team_job?: boolean | null;
    cleaner_line_earnings_finalized_at?: string | null;
    cleaner_id?: string | null;
    payout_owner_cleaner_id?: string | null;
    cleaner_share_percentage?: unknown;
    date?: string | null;
    time?: string | null;
  };

  if (row.is_team_job === true) {
    return { ok: true, skipped: true, reason: "team_job" };
  }
  if (row.cleaner_line_earnings_finalized_at != null && String(row.cleaner_line_earnings_finalized_at).trim() !== "") {
    return { ok: true, skipped: true, reason: "already_finalized" };
  }

  const assigned = String(row.cleaner_id ?? "").trim();
  if (assigned && assigned !== cleanerId.trim()) {
    return { ok: true, skipped: true, reason: "cleaner_mismatch" };
  }

  const { data: lines, error: liErr } = await admin
    .from("booking_line_items")
    .select("id, item_type, slug, name, metadata, earns_cleaner, total_price_cents")
    .eq("booking_id", bid);
  if (liErr) return { ok: false, error: liErr.message };
  const items = lines ?? [];
  if (items.length === 0) {
    return { ok: true, skipped: true, reason: "no_line_items" };
  }

  const useCanonicalLines =
    !useLegacyPayoutEngine() && canonicalDisplayCents != null && Number.isFinite(Number(canonicalDisplayCents));

  if (useCanonicalLines) {
    const target = Math.max(0, Math.floor(Number(canonicalDisplayCents)));
    const lineInputs: EarningsLineItemInput[] = items
      .map(
        (raw) =>
          raw as {
            id?: string;
            item_type?: string;
            slug?: string | null;
            name?: string | null;
            metadata?: Record<string, unknown> | null;
            earns_cleaner?: boolean | null;
            total_price_cents?: number | null;
          },
      )
      .filter((li) => typeof li.id === "string" && typeof li.item_type === "string")
      .map((li) => ({
        id: String(li.id),
        item_type: String(li.item_type),
        slug: li.slug ?? null,
        name: li.name ?? null,
        metadata: li.metadata ?? null,
        earns_cleaner: li.earns_cleaner ?? null,
        total_price_cents: Number(li.total_price_cents) || 0,
      }));

    const allocations = allocateDisplayCentsAcrossLineItems(target, lineInputs);
    const byLine = new Map(allocations.map((a) => [a.booking_line_item_id, a.allocated_display_earnings_cents]));

    let sum = 0;
    for (const raw of items) {
      const li = raw as { id?: string; earns_cleaner?: boolean | null };
      const id = String(li.id ?? "");
      if (!/^[0-9a-f-]{36}$/i.test(id)) continue;
      const alloc = byLine.get(id) ?? 0;
      sum += alloc;
      const { error: upErr } = await admin.from("booking_line_items").update({ cleaner_earnings_cents: alloc }).eq("id", id);
      if (upErr) {
        void reportOperationalIssue("error", "computeCleanerEarningsForBooking", upErr.message, { bookingId: bid, lineId: id });
        return { ok: false, error: upErr.message };
      }
    }

    const finalizedIso = new Date().toISOString();
    const { error: finErr } = await admin
      .from("bookings")
      .update({
        cleaner_earnings_total_cents: sum,
        cleaner_line_earnings_finalized_at: finalizedIso,
      })
      .eq("id", bid)
      .is("cleaner_line_earnings_finalized_at", null);

    if (finErr) {
      void reportOperationalIssue("error", "computeCleanerEarningsForBooking", finErr.message, { bookingId: bid });
      return { ok: false, error: finErr.message };
    }

    return { ok: true, skipped: false, total_cents: sum, line_count: items.length };
  }

  const share = await resolveEffectiveLineCleanerSharePercentageForBooking(admin, {
    bookingId: bid,
    cleanerId: cleanerId.trim(),
    row,
    logSource: "computeCleanerEarningsForBooking",
  });
  let total = 0;
  for (const raw of items) {
    const li = raw as { id?: string; earns_cleaner?: boolean | null; total_price_cents?: number | null };
    const id = String(li.id ?? "");
    if (!/^[0-9a-f-]{36}$/i.test(id)) continue;
    const earns = li.earns_cleaner !== false;
    const cents = Math.max(0, Math.round(Number(li.total_price_cents) || 0));
    const alloc = earns ? Math.round(cents * share) : 0;
    total += alloc;
    const { error: upErr } = await admin.from("booking_line_items").update({ cleaner_earnings_cents: alloc }).eq("id", id);
    if (upErr) {
      void reportOperationalIssue("error", "computeCleanerEarningsForBooking", upErr.message, { bookingId: bid, lineId: id });
      return { ok: false, error: upErr.message };
    }
  }

  const finalizedIso = new Date().toISOString();
  const { error: finErr } = await admin
    .from("bookings")
    .update({
      cleaner_earnings_total_cents: total,
      cleaner_line_earnings_finalized_at: finalizedIso,
    })
    .eq("id", bid)
    .is("cleaner_line_earnings_finalized_at", null);

  if (finErr) {
    void reportOperationalIssue("error", "computeCleanerEarningsForBooking", finErr.message, { bookingId: bid });
    return { ok: false, error: finErr.message };
  }

  return { ok: true, skipped: false, total_cents: total, line_count: items.length };
}
