"use client";

import { ANALYTICS_EVENTS } from "@/lib/analytics/userEventRegistry";
import { getSupabaseBrowser } from "@/lib/supabase/browser";

export type AssistantAnalyticsEventType =
  | typeof ANALYTICS_EVENTS.SLOT_SELECTED
  | typeof ANALYTICS_EVENTS.EXTRA_ADDED
  | typeof ANALYTICS_EVENTS.RECOMMENDATION_CLICKED
  | typeof ANALYTICS_EVENTS.TIMES_LOADED
  | typeof ANALYTICS_EVENTS.PRICE_CALCULATED;

/**
 * Fire-and-forget analytics for the booking assistant (requires signed-in user).
 */
export function trackAssistantEvent(eventType: AssistantAnalyticsEventType, payload: Record<string, unknown>): void {
  const sb = getSupabaseBrowser();
  if (!sb) return;

  void sb.auth.getSession().then(({ data: { session } }) => {
    const token = session?.access_token;
    if (!token) return;
    void fetch("/api/booking/assistant-event", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ event_type: eventType, payload }),
    }).catch(() => {
      /* non-blocking */
    });
  });
}
