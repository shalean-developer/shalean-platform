import type { SupabaseClient } from "@supabase/supabase-js";

export type ReviewPromptFunnelStats = {
  /** Unique bookings with at least one successful review_prompt_sent event in window. */
  promptsSent: number;
  /** Unique prompted bookings with at least one review_prompt_clicked event in window. */
  promptClicks: number;
  /** Unique prompted bookings that submitted a review in window. */
  reviewsSubmitted: number;
  /** submitted prompted bookings / prompted bookings. */
  conversionRate: number | null;
  /** clicked prompted bookings / prompted bookings. */
  clickThroughRate: number | null;
};

type ReviewEventRow = {
  event_type?: string;
  booking_id?: string | null;
  payload?: Record<string, unknown> | null;
};

const REVIEW_EVENT_PAGE_SIZE = 500;

/**
 * Booking-deduped funnel across email/SMS/manual prompt sources.
 *
 * Only successful prompt events (payload.sent === true) create the denominator.
 * Clicks/submissions are counted as conversions only when the same booking was
 * successfully prompted in the requested window.
 *
 * Results are paged explicitly because Supabase/PostgREST may cap a response
 * at 1,000 rows; an unpaged funnel silently undercounts at higher volumes.
 */
export async function computeReviewPromptConversionRate(
  supabase: SupabaseClient,
  sinceIso: string,
  untilIso: string,
): Promise<ReviewPromptFunnelStats> {
  const rows: ReviewEventRow[] = [];

  for (let from = 0; ; from += REVIEW_EVENT_PAGE_SIZE) {
    const { data, error } = await supabase
      .from("user_events")
      .select("event_type, booking_id, payload")
      .in("event_type", ["review_prompt_sent", "review_submitted", "review_prompt_clicked"])
      .gte("created_at", sinceIso)
      .lt("created_at", untilIso)
      .order("created_at", { ascending: true })
      .range(from, from + REVIEW_EVENT_PAGE_SIZE - 1);

    if (error || !data) {
      return {
        promptsSent: 0,
        promptClicks: 0,
        reviewsSubmitted: 0,
        conversionRate: null,
        clickThroughRate: null,
      };
    }

    const page = data as ReviewEventRow[];
    rows.push(...page);
    if (page.length < REVIEW_EVENT_PAGE_SIZE) break;
  }

  const prompted = new Set<string>();
  const clicked = new Set<string>();
  const submitted = new Set<string>();

  for (const row of rows) {
    const bookingId = String(row.booking_id ?? "").trim();
    if (!bookingId) continue;

    const t = String(row.event_type ?? "");
    if (t === "review_prompt_sent") {
      const payload = row.payload && typeof row.payload === "object" ? row.payload : {};
      if (payload.sent === true) prompted.add(bookingId);
      continue;
    }
    if (t === "review_prompt_clicked") {
      clicked.add(bookingId);
      continue;
    }
    if (t === "review_submitted") {
      submitted.add(bookingId);
    }
  }

  let promptClicks = 0;
  let reviewsSubmitted = 0;
  for (const bookingId of prompted) {
    if (clicked.has(bookingId)) promptClicks++;
    if (submitted.has(bookingId)) reviewsSubmitted++;
  }

  const promptsSent = prompted.size;
  const conversionRate = promptsSent > 0 ? Math.round((reviewsSubmitted / promptsSent) * 1000) / 1000 : null;
  const clickThroughRate = promptsSent > 0 ? Math.round((promptClicks / promptsSent) * 1000) / 1000 : null;
  return { promptsSent, promptClicks, reviewsSubmitted, conversionRate, clickThroughRate };
}
