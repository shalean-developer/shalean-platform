import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ComputeBookingEarningsOutput } from "@/lib/payout/computeBookingEarnings";
import {
  allocateDisplayCentsAcrossLineItems,
  type EarningsLineItemInput,
  sumEligibleLineItemsSubtotalCents,
} from "@/lib/payout/computeEarningsFromLineItems";
import { reportOperationalIssue } from "@/lib/logging/systemLog";

export async function persistBookingCleanerEarningsSnapshot(params: {
  admin: SupabaseClient;
  bookingId: string;
  cleanerId: string;
  lineRows: readonly { id: string; item_type: string; total_price_cents: number }[];
  earnings: ComputeBookingEarningsOutput;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { admin, bookingId, cleanerId, lineRows, earnings } = params;
  const items: EarningsLineItemInput[] = lineRows.map((r) => ({
    id: r.id,
    item_type: r.item_type,
    total_price_cents: r.total_price_cents,
  }));
  const eligibleSubtotal = sumEligibleLineItemsSubtotalCents(items);
  const allocations = allocateDisplayCentsAcrossLineItems(earnings.display_earnings_cents, items);

  const parent = {
    booking_id: bookingId,
    cleaner_id: cleanerId,
    eligible_subtotal_cents: eligibleSubtotal,
    display_earnings_cents: earnings.display_earnings_cents,
    payout_earnings_cents: earnings.payout_earnings_cents,
    internal_earnings_cents: earnings.internal_earnings_cents,
    earnings_model_version: earnings.earnings_model_version,
    earnings_percentage_applied: earnings.earnings_percentage_applied ?? null,
    earnings_cap_cents_applied: earnings.earnings_cap_cents_applied ?? null,
    earnings_tenure_months_at_assignment: earnings.earnings_tenure_months_at_assignment ?? null,
    model_version: "line_items_basis_v1",
    updated_at: new Date().toISOString(),
  };

  const { error: upErr } = await admin.from("booking_cleaner_earnings_snapshot").upsert(parent, {
    onConflict: "booking_id",
  });
  if (upErr) {
    void reportOperationalIssue("error", "persistBookingCleanerEarningsSnapshot", upErr.message, {
      bookingId,
    });
    return { ok: false, error: upErr.message };
  }

  const { error: delErr } = await admin.from("booking_cleaner_earnings_snapshot_lines").delete().eq("booking_id", bookingId);
  if (delErr) {
    void reportOperationalIssue("error", "persistBookingCleanerEarningsSnapshot", delErr.message, {
      bookingId,
    });
    return { ok: false, error: delErr.message };
  }

  if (allocations.length > 0) {
    const lineInserts = allocations.map((a) => ({
      booking_id: bookingId,
      booking_line_item_id: a.booking_line_item_id,
      allocated_display_earnings_cents: a.allocated_display_earnings_cents,
    }));
    const { error: insErr } = await admin.from("booking_cleaner_earnings_snapshot_lines").insert(lineInserts);
    if (insErr) {
      void reportOperationalIssue("error", "persistBookingCleanerEarningsSnapshot", insErr.message, {
        bookingId,
      });
      return { ok: false, error: insErr.message };
    }
  }

  return { ok: true };
}
