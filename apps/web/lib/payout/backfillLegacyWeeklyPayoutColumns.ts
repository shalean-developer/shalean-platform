import type { SupabaseClient } from "@supabase/supabase-js";

type LegacyBackfillRow = {
  id: string;
  display_earnings_cents?: number | null;
  payout_earnings_cents?: number | null;
  cleaner_earnings_total_cents?: number | null;
  cleaner_payout_cents?: number | null;
  cleaner_bonus_cents?: number | null;
};

/** Derive weekly-batch legacy columns from persisted hybrid earnings when only display/total is set. */
export function deriveLegacyWeeklyPayoutColumns(row: {
  display_earnings_cents?: number | null;
  payout_earnings_cents?: number | null;
  cleaner_earnings_total_cents?: number | null;
  cleaner_bonus_cents?: number | null;
}): { cleaner_payout_cents: number; cleaner_bonus_cents: number } | null {
  const display = Math.floor(
    Number(row.display_earnings_cents ?? row.cleaner_earnings_total_cents ?? 0),
  );
  if (!Number.isFinite(display) || display <= 0) return null;

  let payoutCents = Math.floor(Number(row.payout_earnings_cents ?? 0));
  let bonusCents = Math.max(0, Math.floor(Number(row.cleaner_bonus_cents ?? 0)));

  if (payoutCents <= 0 && bonusCents <= 0) {
    payoutCents = display;
    bonusCents = 0;
  } else if (payoutCents <= 0) {
    payoutCents = Math.max(0, display - bonusCents);
  } else if (bonusCents <= 0 && payoutCents < display) {
    bonusCents = Math.max(0, display - payoutCents);
  }

  if (payoutCents + bonusCents <= 0) return null;
  return { cleaner_payout_cents: payoutCents, cleaner_bonus_cents: bonusCents };
}

export type BackfillLegacyWeeklyPayoutColumnsResult = {
  scanned: number;
  fixed: number;
  skipped: number;
};

/**
 * Weekly batch preflight: `generateWeeklyPayouts` sums `cleaner_payout_cents + cleaner_bonus_cents`.
 * Older completed rows may have hybrid/display earnings finalized while legacy columns stayed null.
 */
export async function backfillLegacyWeeklyPayoutColumnsFromEarnings(
  admin: SupabaseClient,
  limit = 1000,
): Promise<BackfillLegacyWeeklyPayoutColumnsResult> {
  const { data, error } = await admin
    .from("bookings")
    .select("id, display_earnings_cents, payout_earnings_cents, cleaner_earnings_total_cents, cleaner_payout_cents, cleaner_bonus_cents")
    .eq("status", "completed")
    .eq("is_test", false)
    .is("cleaner_payout_cents", null)
    .limit(limit);

  if (error) throw new Error(error.message);

  let fixed = 0;
  let skipped = 0;
  for (const raw of data ?? []) {
    const row = raw as LegacyBackfillRow;
    const derived = deriveLegacyWeeklyPayoutColumns(row);
    if (!derived) {
      skipped += 1;
      continue;
    }
    const { error: upErr } = await admin
      .from("bookings")
      .update({
        cleaner_payout_cents: derived.cleaner_payout_cents,
        cleaner_bonus_cents: derived.cleaner_bonus_cents,
      })
      .eq("id", row.id)
      .is("cleaner_payout_cents", null);
    if (upErr) {
      skipped += 1;
      continue;
    }
    fixed += 1;
  }

  return { scanned: (data ?? []).length, fixed, skipped };
}

export class PayoutGenerationBlockedError extends Error {
  readonly remaining: number;
  readonly bookingIds: string[];

  constructor(message: string, opts: { remaining: number; bookingIds: string[] }) {
    super(message);
    this.name = "PayoutGenerationBlockedError";
    this.remaining = opts.remaining;
    this.bookingIds = opts.bookingIds;
  }
}

/** Completed rows that still block weekly batch after earnings exist but legacy columns cannot be derived. */
export async function countCompletedBlockingMissingLegacyPayout(
  admin: SupabaseClient,
): Promise<{ count: number; bookingIds: string[] }> {
  const { data, error } = await admin
    .from("bookings")
    .select("id, display_earnings_cents, cleaner_earnings_total_cents")
    .eq("status", "completed")
    .eq("is_test", false)
    .is("cleaner_payout_cents", null)
    .limit(50);

  if (error) throw new Error(error.message);

  const blocking = (data ?? []).filter((row) => {
    const display = Math.floor(
      Number(
        (row as { display_earnings_cents?: number | null }).display_earnings_cents ??
          (row as { cleaner_earnings_total_cents?: number | null }).cleaner_earnings_total_cents ??
          0,
      ),
    );
    return Number.isFinite(display) && display > 0;
  });

  return {
    count: blocking.length,
    bookingIds: blocking.map((row) => String((row as { id?: string }).id ?? "")).filter(Boolean),
  };
}
