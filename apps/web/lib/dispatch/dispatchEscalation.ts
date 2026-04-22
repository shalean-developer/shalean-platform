import { logSystemEvent, reportOperationalIssue } from "@/lib/logging/systemLog";

/**
 * Stage-2 retry: log + optional webhook for ops visibility.
 */
export async function notifyDispatchEscalationAdmin(params: {
  bookingId: string;
  retriesDone: number;
  lastReason?: string | null;
}): Promise<void> {
  const webhook = process.env.DISPATCH_ADMIN_WEBHOOK_URL?.trim();
  await logSystemEvent({
    level: "warn",
    source: "dispatch_escalation_admin",
    message: "Dispatch retry escalated — manual attention may be needed",
    context: {
      bookingId: params.bookingId,
      retriesDone: params.retriesDone,
      lastReason: params.lastReason ?? null,
    },
  });

  if (!webhook) return;

  try {
    await fetch(webhook, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: "dispatch_escalation",
        bookingId: params.bookingId,
        retriesDone: params.retriesDone,
        lastReason: params.lastReason ?? null,
      }),
      signal: AbortSignal.timeout(8000),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await reportOperationalIssue("warn", "notifyDispatchEscalationAdmin", msg, {
      bookingId: params.bookingId,
    });
  }
}
