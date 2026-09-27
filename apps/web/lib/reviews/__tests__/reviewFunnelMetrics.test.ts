import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { computeReviewPromptConversionRate } from "@/lib/reviews/reviewFunnelMetrics";

function makeSupabase(rows: Array<Record<string, unknown>>) {
  return {
    from() {
      const chain: any = {};
      chain.select = () => chain;
      chain.in = () => chain;
      chain.gte = () => chain;
      chain.lt = () => chain;
      chain.order = () => chain;
      chain.range = async (from: number, to: number) => ({
        data: rows.slice(from, to + 1),
        error: null,
      });
      return chain;
    },
  } as unknown as SupabaseClient;
}

describe("reviewFunnelMetrics", () => {
  it("dedupes by booking and only converts bookings with a successful prompt", async () => {
    const supabase = makeSupabase([
      { event_type: "review_prompt_sent", booking_id: "b1", payload: { sent: true, channel: "email" } },
      { event_type: "review_prompt_sent", booking_id: "b1", payload: { sent: true, channel: "manual" } },
      { event_type: "review_prompt_clicked", booking_id: "b1", payload: {} },
      { event_type: "review_submitted", booking_id: "b1", payload: {} },
      { event_type: "review_prompt_sent", booking_id: "b2", payload: { sent: true, channel: "email" } },
      { event_type: "review_prompt_clicked", booking_id: "b2", payload: {} },
      { event_type: "review_submitted", booking_id: "b3", payload: {} },
      { event_type: "review_prompt_sent", booking_id: "b4", payload: { sent: false, channel: "sms" } },
      { event_type: "review_submitted", booking_id: "b4", payload: {} },
    ]);

    const result = await computeReviewPromptConversionRate(
      supabase,
      "2026-09-20T00:00:00Z",
      "2026-09-28T00:00:00Z",
    );

    expect(result).toEqual({
      promptsSent: 2,
      promptClicks: 2,
      reviewsSubmitted: 1,
      conversionRate: 0.5,
      clickThroughRate: 1,
    });
  });

  it("continues past the first 500-row page", async () => {
    const rows: Array<Record<string, unknown>> = Array.from({ length: 501 }, (_, i) => ({
      event_type: "review_prompt_sent",
      booking_id: `b-${i}`,
      payload: { sent: true },
    }));
    rows.push({
      event_type: "review_submitted",
      booking_id: "b-500",
      payload: {},
    });

    const result = await computeReviewPromptConversionRate(
      makeSupabase(rows),
      "2026-09-20T00:00:00Z",
      "2026-09-28T00:00:00Z",
    );

    expect(result.promptsSent).toBe(501);
    expect(result.reviewsSubmitted).toBe(1);
  });
});
