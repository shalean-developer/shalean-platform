import { reportOperationalIssue } from "@/lib/logging/systemLog";

/**
 * Manual SLA escalation from admin: logs + optional Slack/email via same dispatch webhooks.
 */
export async function emitSlaBreachManualEscalation(params: {
  bookingId: string;
  slaBreachMinutes: number;
  lastActionMinutesAgo: number | null;
}): Promise<void> {
  const webhook = process.env.DISPATCH_ADMIN_WEBHOOK_URL?.trim();
  const criticalUrl = process.env.DISPATCH_ALERT_WEBHOOK_CRITICAL_URL?.trim();

  await reportOperationalIssue("error", "sla_breach_manual_escalate", `Manual SLA escalation: booking ${params.bookingId}`, {
    bookingId: params.bookingId,
    slaBreachMinutes: params.slaBreachMinutes,
    lastActionMinutesAgo: params.lastActionMinutesAgo,
    source: "admin_sla_queue",
  });

  const payload = {
    type: "sla_breach_manual_escalate",
    bookingId: params.bookingId,
    slaBreachMinutes: params.slaBreachMinutes,
    lastActionMinutesAgo: params.lastActionMinutesAgo,
    alertSeverity: "high" as const,
    routingHint: "immediate" as const,
  };
  const body = JSON.stringify(payload);

  const urls = new Set<string>();
  if (webhook) urls.add(webhook);
  if (criticalUrl) urls.add(criticalUrl);
  if (urls.size === 0) return;

  try {
    for (const url of urls) {
      await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
        signal: AbortSignal.timeout(12_000),
      });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await reportOperationalIssue("warn", "emitSlaBreachManualEscalation_webhook", msg, {
      bookingId: params.bookingId,
    });
  }
}
