import { reportOperationalIssue } from "@/lib/logging/systemLog";

export type DispatchEscalationPhase = "retry" | "terminal_unassignable";

/**
 * Stage-2 retry: log + optional webhook for ops visibility (Slack/email bridge via webhook).
 */
export async function notifyDispatchEscalationAdmin(params: {
  bookingId: string;
  retriesDone: number;
  lastReason?: string | null;
  phase?: DispatchEscalationPhase;
}): Promise<void> {
  const webhook = process.env.DISPATCH_ADMIN_WEBHOOK_URL?.trim();
  const phase = params.phase ?? "retry";
  const terminal = phase === "terminal_unassignable";

  await reportOperationalIssue(
    terminal ? "error" : "warn",
    terminal ? "dispatch_unassignable" : "dispatch_escalation_admin",
    terminal
      ? `Booking ${params.bookingId}: dispatch exhausted; dispatch_status set to unassignable`
      : `Booking ${params.bookingId}: dispatch retry escalation (retriesDone=${params.retriesDone})`,
    {
      bookingId: params.bookingId,
      retriesDone: params.retriesDone,
      lastReason: params.lastReason ?? null,
      phase,
    },
  );

  const criticalUrl = process.env.DISPATCH_ALERT_WEBHOOK_CRITICAL_URL?.trim();
  const payload = {
    type: terminal ? "dispatch_unassignable" : "dispatch_escalation",
    bookingId: params.bookingId,
    retriesDone: params.retriesDone,
    lastReason: params.lastReason ?? null,
    phase,
    alertSeverity: terminal ? ("high" as const) : ("medium" as const),
    routingHint: terminal ? ("immediate" as const) : ("batch_digest" as const),
  };
  const body = JSON.stringify(payload);

  const post = async (url: string) => {
    await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      signal: AbortSignal.timeout(terminal ? 12_000 : 8000),
    });
  };

  const urls = new Set<string>();
  if (webhook) urls.add(webhook);
  if (terminal && criticalUrl) urls.add(criticalUrl);
  if (urls.size === 0) return;

  try {
    for (const url of urls) {
      await post(url);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await reportOperationalIssue("warn", "notifyDispatchEscalationAdmin", msg, {
      bookingId: params.bookingId,
    });
  }
}
