import type { SupabaseClient } from "@supabase/supabase-js";
import { ANALYTICS_EVENTS } from "@/lib/analytics/userEventRegistry";
import { postSlackIncomingWebhook } from "@/lib/analytics/postSlackWebhook";

function utcDayRange(dayOffsetFromUtcToday: number): { start: string; end: string } {
  const now = new Date();
  const utcMidnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + dayOffsetFromUtcToday);
  const start = new Date(utcMidnight).toISOString();
  const end = new Date(utcMidnight + 86400000).toISOString();
  return { start, end };
}

async function countEvent(admin: SupabaseClient, startIso: string, endIso: string): Promise<number> {
  const { count, error } = await admin
    .from("user_events")
    .select("id", { count: "exact", head: true })
    .eq("event_type", ANALYTICS_EVENTS.BOOKING_COMPLETED)
    .gte("created_at", startIso)
    .lt("created_at", endIso);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

/**
 * Compares UTC yesterday vs prior day `booking_completed` counts; notifies Slack when drop exceeds threshold.
 */
export async function maybeAlertBookingCompletionDrop(params: {
  admin: SupabaseClient;
  slackWebhookUrl?: string | null;
  /** Fractional drop vs baseline (e.g. 0.15 = 15%). */
  dropThreshold?: number;
  minBaseline?: number;
}): Promise<{ alerted: boolean; yesterday?: number; priorDay?: number }> {
  const dropThreshold = params.dropThreshold ?? 0.15;
  const minBaseline = params.minBaseline ?? 10;
  const slack = params.slackWebhookUrl?.trim();

  const y = utcDayRange(-1);
  const prior = utcDayRange(-2);

  const [yCount, pCount] = await Promise.all([
    countEvent(params.admin, y.start, y.end),
    countEvent(params.admin, prior.start, prior.end),
  ]);

  if (pCount < minBaseline || yCount >= pCount * (1 - dropThreshold)) {
    return { alerted: false, yesterday: yCount, priorDay: pCount };
  }

  const dropPct = Math.round((1 - yCount / Math.max(pCount, 1)) * 1000) / 10;
  const msg = [
    ":warning: *Booking completion drop (UTC)*",
    `Yesterday \`${y.start.slice(0, 10)}\`: *${yCount}* \`${ANALYTICS_EVENTS.BOOKING_COMPLETED}\``,
    `Prior day: *${pCount}*`,
    `Approx drop: *${dropPct}%* (threshold ${dropThreshold * 100}%)`,
  ].join("\n");

  if (slack) {
    const res = await postSlackIncomingWebhook(slack, msg);
    if (!res.ok) {
      throw new Error(`Slack webhook failed: ${res.status}`);
    }
  }

  return { alerted: true, yesterday: yCount, priorDay: pCount };
}
