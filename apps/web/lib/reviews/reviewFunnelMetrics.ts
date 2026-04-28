import type { SupabaseClient } from "@supabase/supabase-js";

export type ReviewPromptFunnelStats = {
  /** `review_prompt_sent` rows with payload.sent === true in window. */
  promptsSent: number;
  /** `review_prompt_clicked` (growth + review KPI ingest). */
  promptClicks: number;
  /** `review_submitted` in window. */
  reviewsSubmitted: number;
  /** submitted / sent when promptsSent > 0. */
  conversionRate: number | null;
  /** clicks / sent when promptsSent > 0. */
  clickThroughRate: number | null;
};

/**
 * Funnel: SMS (or logged) prompts that succeeded vs link clicks vs reviews submitted.
 * Window is inclusive on `sinceIso`, exclusive on `untilIso` (typical: last 7d / now).
 */
export async function computeReviewPromptConversionRate(
  supabase: SupabaseClient,
  sinceIso: string,
  untilIso: string,
): Promise<ReviewPromptFunnelStats> {
  const { data, error } = await supabase
    .from("user_events")
    .select("event_type, payload")
    .in("event_type", ["review_prompt_sent", "review_submitted", "review_prompt_clicked"])
    .gte("created_at", sinceIso)
    .lt("created_at", untilIso);

  if (error || !data) {
    return { promptsSent: 0, promptClicks: 0, reviewsSubmitted: 0, conversionRate: null, clickThroughRate: null };
  }

  let promptsSent = 0;
  let promptClicks = 0;
  let reviewsSubmitted = 0;
  for (const row of data as { event_type?: string; payload?: Record<string, unknown> | null }[]) {
    const t = String(row.event_type ?? "");
    if (t === "review_submitted") {
      reviewsSubmitted++;
      continue;
    }
    if (t === "review_prompt_clicked") {
      promptClicks++;
      continue;
    }
    if (t === "review_prompt_sent") {
      const p = row.payload && typeof row.payload === "object" ? row.payload : {};
      if (p.sent === true) promptsSent++;
    }
  }

  const conversionRate = promptsSent > 0 ? Math.round((reviewsSubmitted / promptsSent) * 1000) / 1000 : null;
  const clickThroughRate = promptsSent > 0 ? Math.round((promptClicks / promptsSent) * 1000) / 1000 : null;
  return { promptsSent, promptClicks, reviewsSubmitted, conversionRate, clickThroughRate };
}
