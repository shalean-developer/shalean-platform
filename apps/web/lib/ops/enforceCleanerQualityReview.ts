import type { SupabaseClient } from "@supabase/supabase-js";
import { postDispatchControlAlert } from "@/lib/ops/dispatchControlWebhook";

export type CleanerQualitySyncResult = { flagged: number; cleared: number; newlyFlaggedIds: string[] };

/**
 * Sets `needs_quality_review` when rating < 3.5 and review_count >= 5; clears when recovered.
 * Fires a one-time control webhook per cleaner id (deduped) when newly flagged.
 */
export async function syncCleanerQualityFlags(supabase: SupabaseClient): Promise<CleanerQualitySyncResult> {
  const { data: flaggedRows, error: flagErr } = await supabase
    .from("cleaners")
    .update({ needs_quality_review: true })
    .lt("rating", 3.5)
    .gte("review_count", 5)
    .eq("needs_quality_review", false)
    .select("id");

  const newlyFlaggedIds =
    !flagErr && Array.isArray(flaggedRows)
      ? flaggedRows.map((r) => String((r as { id?: string }).id ?? "")).filter(Boolean)
      : [];

  const { data: clearedRows, error: clearErr } = await supabase
    .from("cleaners")
    .update({ needs_quality_review: false })
    .eq("needs_quality_review", true)
    .or("rating.gte.3.5,review_count.lt.5")
    .select("id");

  const cleared = clearErr ? 0 : clearedRows?.length ?? 0;

  for (const cid of newlyFlaggedIds) {
    await postDispatchControlAlert(
      {
        errorType: "cleaner_quality_flagged",
        message: "Cleaner flagged for low rating with sufficient reviews (dispatch priority reduced).",
        cleanerId: cid,
        dedupeKey: `cleaner_quality_flagged:${cid}`,
        dedupeWindowMinutes: 24 * 60,
        extra: { rule: "rating_lt_3_5_and_review_count_gte_5" },
      },
      { supabase },
    );
  }

  return { flagged: newlyFlaggedIds.length, cleared, newlyFlaggedIds };
}
