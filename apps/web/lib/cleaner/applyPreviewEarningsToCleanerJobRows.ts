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
 * For each job-like row: if {@link resolveCleanerEarningsCents} is non-null, normalizes camel/snake
 * earnings fields and marks **not** estimated. Otherwise runs {@link previewDisplayEarningsCentsForCleanerJob}
 * up to `maxPreviews` times and attaches preview cents with estimate flags.
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
    if (resolved != null) {
      out.push({
        ...j,
        displayEarningsCents: resolved,
        earnings_cents: resolved,
        display_earnings_cents: resolved,
        displayEarningsIsEstimate: false,
        earnings_estimated: false,
        earnings_is_estimate: false,
      });
      continue;
    }

    if (used >= maxPreviews) {
      out.push(j);
      continue;
    }

    const id = String(j.id ?? "").trim();
    if (!id) {
      out.push(j);
      continue;
    }

    used += 1;
    const previewCents = await previewDisplayEarningsCentsForCleanerJob(admin, { bookingId: id, cleanerId });
    if (previewCents == null) {
      out.push(j);
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
    });
  }

  return out;
}
