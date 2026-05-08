import type { SupabaseClient } from "@supabase/supabase-js";
import { maybeAlertBookingCompletionDrop } from "@/lib/analytics/bookingCompletionDropScan";
import { postSlackIncomingWebhook } from "@/lib/analytics/postSlackWebhook";
import { ANALYTICS_EVENTS } from "@/lib/analytics/userEventRegistry";

function utcDayRange(dayOffsetFromUtcToday: number): { start: string; end: string } {
  const now = new Date();
  const utcMidnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + dayOffsetFromUtcToday);
  const start = new Date(utcMidnight).toISOString();
  const end = new Date(utcMidnight + 86400000).toISOString();
  return { start, end };
}

async function countEventType(
  admin: SupabaseClient,
  eventType: string,
  startIso: string,
  endIso: string,
): Promise<number> {
  const { count, error } = await admin
    .from("user_events")
    .select("id", { count: "exact", head: true })
    .eq("event_type", eventType)
    .gte("created_at", startIso)
    .lt("created_at", endIso);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export type OperationalAlertsResult = {
  bookingCompletionDrop: { skipped: true } | Awaited<ReturnType<typeof maybeAlertBookingCompletionDrop>>;
  scheduleFetchSpike?: {
    alerted: boolean;
    yesterday?: number;
    priorDay?: number;
    message?: string;
  };
  slackMessagesSent: number;
};

/**
 * Booking completion drop + schedule API failure spike (UTC day-over-day). Posts separate Slack messages when triggered.
 */
export async function runAnalyticsOperationalAlerts(params: {
  admin: SupabaseClient;
  slackWebhookUrl?: string | null;
  disabled?: boolean;
}): Promise<OperationalAlertsResult> {
  const slack = params.slackWebhookUrl?.trim();
  let slackMessagesSent = 0;

  if (params.disabled) {
    return { bookingCompletionDrop: { skipped: true }, slackMessagesSent: 0 };
  }

  const bookingCompletionDrop = await maybeAlertBookingCompletionDrop({
    admin: params.admin,
    slackWebhookUrl: slack || undefined,
  });

  if (bookingCompletionDrop.alerted && slack) slackMessagesSent += 1;

  const y = utcDayRange(-1);
  const prior = utcDayRange(-2);
  const [ySched, pSched] = await Promise.all([
    countEventType(params.admin, ANALYTICS_EVENTS.BOOKING_SCHEDULE_FETCH_FAILED, y.start, y.end),
    countEventType(params.admin, ANALYTICS_EVENTS.BOOKING_SCHEDULE_FETCH_FAILED, prior.start, prior.end),
  ]);

  let scheduleFetchSpike: OperationalAlertsResult["scheduleFetchSpike"];
  const spikeThresholdMult = 2;
  const spikeMinAbs = 8;
  const baselineOk = pSched >= 3;
  const spiked =
    baselineOk && ySched >= Math.max(pSched * spikeThresholdMult, pSched + spikeMinAbs) && ySched >= 10;

  if (spiked) {
    const msg = [
      ":warning: *Schedule fetch failures spike (UTC)*",
      `Yesterday \`${y.start.slice(0, 10)}\`: *${ySched}* \`${ANALYTICS_EVENTS.BOOKING_SCHEDULE_FETCH_FAILED}\``,
      `Prior day: *${pSched}*`,
      "Check `/api/booking/time-slots` health, cleaner availability, and suburb coverage.",
    ].join("\n");
    scheduleFetchSpike = {
      alerted: true,
      yesterday: ySched,
      priorDay: pSched,
      message: msg,
    };
    if (slack) {
      const res = await postSlackIncomingWebhook(slack, msg);
      if (!res.ok) throw new Error(`Slack webhook failed (schedule spike): ${res.status}`);
      slackMessagesSent += 1;
    }
  } else {
    scheduleFetchSpike = { alerted: false, yesterday: ySched, priorDay: pSched };
  }

  return { bookingCompletionDrop, scheduleFetchSpike, slackMessagesSent };
}
