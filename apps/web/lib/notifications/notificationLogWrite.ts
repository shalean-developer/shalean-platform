/** Inserts `notification_logs` via service role — call from server code only (no `server-only`: import graph reaches Pages Router). */
import { scheduleCustomerContactHealthRefresh } from "@/lib/notifications/customerContactHealth";
import { estimatedNotificationCostUsd, NOTIFICATION_COST_CURRENCY } from "@/lib/notifications/notificationCostEstimates";
import { reportOperationalIssue } from "@/lib/logging/systemLog";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export type NotificationLogChannel = "email" | "whatsapp" | "sms";
export type NotificationLogProvider = "resend" | "twilio" | "meta";
export type NotificationLogStatus = "sent" | "failed";

export type NotificationLogWriteInput = {
  booking_id?: string | null;
  channel: NotificationLogChannel;
  template_key: string;
  recipient: string;
  status: NotificationLogStatus;
  error?: string | null;
  provider: NotificationLogProvider;
  /** `customer` | `cleaner` | `admin` (or future values). */
  role?: string | null;
  /** Product/lifecycle step, e.g. `payment_confirmed`, `assigned`, `reminder_2h`. */
  event_type?: string | null;
  payload?: Record<string, unknown> | null;
};

const MAX_RECIPIENT = 512;
const MAX_ERROR = 8000;
const MAX_HTML = 32000;
const MAX_TEXT = 12000;

function payloadDecision(payload: Record<string, unknown>): string | null {
  const raw = payload.decision;
  return typeof raw === "string" && raw.trim() ? raw.trim().slice(0, 160) : null;
}

function withCostDefaults(channel: NotificationLogChannel, payload: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...payload };
  const rawCost = out.cost_estimate;
  const n = typeof rawCost === "number" ? rawCost : Number(rawCost);
  if (!Number.isFinite(n) || n < 0) {
    out.cost_estimate = estimatedNotificationCostUsd(channel);
  }
  if (typeof out.currency !== "string" || !out.currency.trim()) {
    out.currency = NOTIFICATION_COST_CURRENCY;
  }
  return out;
}

function shrinkPayload(payload: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...payload };
  if (typeof out.html === "string" && out.html.length > MAX_HTML) {
    out.html = `${out.html.slice(0, MAX_HTML)}…[truncated]`;
  }
  if (typeof out.text === "string" && out.text.length > MAX_TEXT) {
    out.text = `${out.text.slice(0, MAX_TEXT)}…[truncated]`;
  }
  if (typeof out.body === "string" && out.body.length > MAX_TEXT) {
    out.body = `${out.body.slice(0, MAX_TEXT)}…[truncated]`;
  }
  return out;
}

/**
 * Best-effort insert; never throws — failures are reported once to operational logs.
 */
export async function writeNotificationLog(input: NotificationLogWriteInput): Promise<void> {
  const admin = getSupabaseAdmin();
  if (!admin) return;

  const template_key = String(input.template_key ?? "unknown").trim().slice(0, 160) || "unknown";
  const recipient = String(input.recipient ?? "").trim().slice(0, MAX_RECIPIENT);
  if (!recipient) return;
  const payload = shrinkPayload(
    withCostDefaults(
      input.channel,
      input.payload && typeof input.payload === "object" && !Array.isArray(input.payload)
        ? (input.payload as Record<string, unknown>)
        : {},
    ),
  ) as Record<string, unknown>;

  const row = {
    booking_id: input.booking_id?.trim() ? input.booking_id.trim().slice(0, 128) : null,
    channel: input.channel,
    template_key,
    recipient,
    status: input.status,
    error: input.error ? String(input.error).slice(0, MAX_ERROR) : null,
    provider: input.provider,
    role: input.role?.trim() ? input.role.trim().slice(0, 64) : null,
    event_type: input.event_type?.trim() ? input.event_type.trim().slice(0, 96) : null,
    decision: payloadDecision(payload),
    payload,
  };

  const { error } = await admin.from("notification_logs").insert(row);
  if (error) {
    void reportOperationalIssue("warn", "writeNotificationLog", error.message, {
      channel: input.channel,
      template_key,
    });
    return;
  }

  scheduleCustomerContactHealthRefresh({
    role: input.role ?? null,
    channel: input.channel,
    recipient,
  });
}
