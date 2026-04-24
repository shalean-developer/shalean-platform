import { logSystemEvent } from "@/lib/logging/systemLog";

/**
 * Customer / admin Resend outcomes for `notification_system_logs_summary` (email_sent / email_failed).
 */
export async function logPipelineEmailTelemetry(params: {
  role: "customer" | "admin";
  channel: string;
  sent: boolean;
  error?: string;
  bookingId?: string;
  bookingIds?: string[];
}): Promise<void> {
  const context: Record<string, unknown> = {
    role: params.role,
    channel: params.channel,
  };
  if (params.bookingId) context.bookingId = params.bookingId;
  if (params.bookingIds?.length) context.bookingIds = params.bookingIds;

  if (params.sent) {
    await logSystemEvent({
      level: "info",
      source: "email_sent",
      message: params.channel.slice(0, 500),
      context,
    });
  } else {
    await logSystemEvent({
      level: "warn",
      source: "email_failed",
      message: (params.error ?? "send_failed").slice(0, 2000),
      context,
    });
  }
}
