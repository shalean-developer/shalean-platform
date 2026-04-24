import { getDefaultFromAddress, getResend } from "@/lib/email/resendFrom";
import { reportOperationalIssue } from "@/lib/logging/systemLog";
import { writeNotificationLog } from "@/lib/notifications/notificationLogWrite";
import { getVariableAllowlistFromRow, renderTemplate } from "@/lib/templates/render";
import { getTemplate } from "@/lib/templates/store";
import type { TemplateChannel } from "@/lib/templates/types";

function resolveBookingIdForLog(
  bookingId: string | null | undefined,
  data: Record<string, unknown>,
): string | null {
  const a = bookingId?.trim();
  if (a) return a;
  const b = data.booking_id;
  return typeof b === "string" && b.trim() ? b.trim() : null;
}

const DEFAULT_TEMPLATE_EMAIL_ROLE = "admin";
const DEFAULT_TEMPLATE_EMAIL_EVENT = "template_test_send";

function templateEmailLogPayload(
  eventType: string,
  extra: Record<string, unknown>,
): Record<string, unknown> {
  return { ...extra, step: eventType };
}

/**
 * Sends a single-channel template email (admin test-send and future multi-key flows).
 */
export async function sendEmailFromTemplateKey(params: {
  to: string;
  key: string;
  data: Record<string, unknown>;
  /** When omitted, uses string `data.booking_id` when present. */
  bookingId?: string | null;
  /** Defaults to admin / template_test_send (admin UI test send). */
  logRole?: string | null;
  logEventType?: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const bid = resolveBookingIdForLog(params.bookingId, params.data);
  const role = (params.logRole ?? DEFAULT_TEMPLATE_EMAIL_ROLE).trim().slice(0, 64) || DEFAULT_TEMPLATE_EMAIL_ROLE;
  const eventType =
    (params.logEventType ?? DEFAULT_TEMPLATE_EMAIL_EVENT).trim().slice(0, 96) || DEFAULT_TEMPLATE_EMAIL_EVENT;

  const template = await getTemplate(params.key, "email");
  if (!template) {
    await writeNotificationLog({
      booking_id: bid,
      channel: "email",
      template_key: params.key,
      recipient: params.to,
      status: "failed",
      error: "template_not_found",
      provider: "resend",
      role,
      event_type: eventType,
      payload: templateEmailLogPayload(eventType, { phase: "resolve_template" }),
    });
    return { ok: false, error: "Template not found" };
  }

  const resend = getResend();
  if (!resend) {
    await writeNotificationLog({
      booking_id: bid,
      channel: "email",
      template_key: params.key,
      recipient: params.to,
      status: "failed",
      error: "resend_not_configured",
      provider: "resend",
      role,
      event_type: eventType,
      payload: templateEmailLogPayload(eventType, { phase: "resend_client" }),
    });
    return { ok: false, error: "Email not configured" };
  }

  const allow = getVariableAllowlistFromRow(template);
  const renderOpts = { allowedKeys: allow.length ? allow : undefined, escapeHtmlValues: true as const };
  const html = renderTemplate(template.content, params.data, renderOpts);
  const subjectRaw =
    template.subject?.trim() ? template.subject : `Shalean — ${params.key}`;
  const subject = renderTemplate(subjectRaw, params.data, renderOpts);

  try {
    const { error } = await resend.emails.send({
      from: getDefaultFromAddress(),
      to: params.to,
      subject,
      html,
    });
    if (error) {
      await reportOperationalIssue("warn", "sendEmailFromTemplateKey", error.message, { key: params.key });
      await writeNotificationLog({
        booking_id: bid,
        channel: "email",
        template_key: params.key,
        recipient: params.to,
        status: "failed",
        error: error.message,
        provider: "resend",
        role,
        event_type: eventType,
        payload: templateEmailLogPayload(eventType, { subject, html }),
      });
      return { ok: false, error: error.message };
    }
    await writeNotificationLog({
      booking_id: bid,
      channel: "email",
      template_key: params.key,
      recipient: params.to,
      status: "sent",
      error: null,
      provider: "resend",
      role,
      event_type: eventType,
      payload: templateEmailLogPayload(eventType, { subject, html }),
    });
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await reportOperationalIssue("warn", "sendEmailFromTemplateKey", msg, { key: params.key });
    await writeNotificationLog({
      booking_id: bid,
      channel: "email",
      template_key: params.key,
      recipient: params.to,
      status: "failed",
      error: msg,
      provider: "resend",
      role,
      event_type: eventType,
      payload: templateEmailLogPayload(eventType, { subject, html }),
    });
    return { ok: false, error: msg };
  }
}

/** Preview helper: loads template for any channel (active only). */
export async function previewTemplateRender(params: {
  key: string;
  channel: TemplateChannel;
  data: Record<string, unknown>;
}): Promise<{ subject: string | null; content: string } | null> {
  const template = await getTemplate(params.key, params.channel);
  if (!template) return null;

  const allow = getVariableAllowlistFromRow(template);
  const escapeHtmlValues = params.channel === "email";
  const stripAngleBrackets = params.channel !== "email";
  const content = renderTemplate(template.content, params.data, {
    allowedKeys: allow.length ? allow : undefined,
    escapeHtmlValues,
    stripAngleBrackets,
  });

  let subject: string | null = null;
  if (template.subject?.trim()) {
    subject = renderTemplate(template.subject, params.data, {
      allowedKeys: allow.length ? allow : undefined,
      escapeHtmlValues: true,
    });
  }
  return { subject, content };
}
