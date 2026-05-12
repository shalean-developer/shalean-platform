import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveCleanerEarningsCents } from "@/lib/cleaner/resolveCleanerEarnings";
import { previewDisplayEarningsCentsForCleanerJob } from "@/lib/payout/persistCleanerPayout";

/** Default cap for sequential `previewDisplayEarningsCentsForCleanerJob` calls per HTTP request. */
export const DEFAULT_CLEANER_JOB_EARNINGS_PREVIEW_CAP = 50;

function resolvedEarningsCentsFromWireRow(rec: Record<string, unknown>): number | null {
  return resolveCleanerEarningsCents({
    cleaner_earnings_total_cents: rec.cleaner_earnings_total_cents,
    payout_frozen_cents: rec.payout_frozen_cents,
    display_earnings_cents: rec.display_earnings_cents ?? rec.displayEarningsCents,
  });
}

/**
 * Acceptance rule: any booking visible to a cleaner must show a positive earning amount.
 * Persisted `0` (stale row, pre-payment basis) is treated as **missing** so we fall through
 * to the runtime preview. Only when persisted **and** preview both come back null/0 do we
 * mark `earnings_basis_pending: true` ("Job earning unavailable" — truly invalid data).
 */
function isPositiveCents(n: number | null | undefined): n is number {
  return typeof n === "number" && Number.isFinite(n) && n > 0;
}

/**
 * For each job-like row:
 *   1. If a persisted source resolves to **positive** cents (`resolveCleanerEarningsCents` >0),
 *      normalize camel/snake earnings fields and mark **not** estimated.
 *   2. Else (null or 0), run {@link previewDisplayEarningsCentsForCleanerJob} (up to `maxPreviews`):
 *      - preview returns positive → attach as estimate; never R0.
 *      - preview returns null / 0 → `earnings_basis_pending: true` and clear any stale wire `0`.
 *
 * Cleaner UI must never display `R 0`: a `0` here is always paired with `earnings_basis_pending: true`
 * so the card renders the "Job earning unavailable" copy instead.
 */
export async function applyPreviewEarningsToCleanerJobRows(
  admin: SupabaseClient,
  params: { cleanerId: string; rows: Record<string, unknown>[]; maxPreviews: number },
): Promise<Record<string, unknown>[]> {
  const { cleanerId, maxPreviews } = params;
  let used = 0;
  const out: Record<string, unknown>[] = [];

  for (const j of params.rows) {
    const resolved = resolvedEarningsCentsFromWireRow(j);
    if (isPositiveCents(resolved)) {
      out.push({
        ...j,
        displayEarningsCents: resolved,
        earnings_cents: resolved,
        display_earnings_cents: resolved,
        displayEarningsIsEstimate: false,
        earnings_estimated: false,
        earnings_is_estimate: false,
        earnings_basis_pending: false,
      });
      continue;
    }

    /** Reset any stale `0` so downstream UI cannot render `R 0`. */
    const clearedZero = {
      ...j,
      displayEarningsCents: null as number | null,
      earnings_cents: null as number | null,
      display_earnings_cents: null as number | null,
    };

    if (used >= maxPreviews) {
      out.push({ ...clearedZero, earnings_basis_pending: true });
      continue;
    }

    const id = String(j.id ?? "").trim();
    if (!id) {
      out.push({ ...clearedZero, earnings_basis_pending: true });
      continue;
    }

    used += 1;
    const previewCents = await previewDisplayEarningsCentsForCleanerJob(admin, { bookingId: id, cleanerId });
    if (!isPositiveCents(previewCents)) {
      out.push({ ...clearedZero, earnings_basis_pending: true });
      continue;
    }

    out.push({
      ...j,
      displayEarningsCents: previewCents,
      earnings_cents: previewCents,
      display_earnings_cents: previewCents,
      displayEarningsIsEstimate: true,
      earnings_estimated: true,
      earnings_is_estimate: true,
      earnings_basis_pending: false,
    });
  }

  return out;
}
