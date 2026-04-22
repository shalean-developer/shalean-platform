"use client";

import { getSupabaseBrowser } from "@/lib/supabase/browser";

/**
 * Fire-and-forget analytics for the booking assistant (requires signed-in user).
 */
export function trackAssistantEvent(
  eventType:
    | "slot_selected"
    | "extra_added"
    | "recommendation_clicked"
    | "times_loaded"
    | "price_calculated",
  payload: Record<string, unknown>,
): void {
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
