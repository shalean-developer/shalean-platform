import { getDefaultFromAddress, getResend } from "@/lib/email/resendFrom";
import { sendEmailFromTemplateKey } from "@/lib/email/sendTemplateEmail";
import { logSystemEvent, reportOperationalIssue } from "@/lib/logging/systemLog";
import { writeNotificationLog } from "@/lib/notifications/notificationLogWrite";
import { getTemplate } from "@/lib/templates/store";

export type DbTemplateAttempt = { usedRow: false } | { usedRow: true; sent: boolean; error?: string };

export async function trySendCustomerEmailFromDbTemplate(params: {
  to: string;
  templateKey: string;
  data: Record<string, unknown>;
  bookingId?: string | null;
  logEventType: string;
  logRole?: string;
}): Promise<DbTemplateAttempt> {
  const template = await getTemplate(params.templateKey, "email");
  if (!template) return { usedRow: false };

  const result = await sendEmailFromTemplateKey({
    to: params.to,
    key: params.templateKey,
    data: params.data,
    bookingId: params.bookingId,
    logRole: params.logRole ?? "customer",
    logEventType: params.logEventType,
  });
  if (!result.ok) return { usedRow: true, sent: false, error: result.error };
  return { usedRow: true, sent: true };
}

async function sendLegacyCustomerEmail(params: {
  to: string;
  subject: string;
  html: string;
  bookingId?: string | null;
  templateKey: string;
  logEventType: string;
  payload?: Record<string, unknown>;
}): Promise<{ sent: boolean; error?: string }> {
  const resend = getResend();
  if (!resend) return { sent: false, error: "Email not configured" };
  const from = getDefaultFromAddress();
  try {
    const { error } = await resend.emails.send({
      from,
      to: params.to,
      subject: params.subject,
      html: params.html,
    });
    if (error) {
      await writeNotificationLog({
        booking_id: params.bookingId ?? null,
        channel: "email",
        template_key: params.templateKey,
        recipient: params.to,
        status: "failed",
        error: error.message,
        provider: "resend",
        role: "customer",
        event_type: params.logEventType,
        payload: params.payload ?? { source: "legacy_html" },
      });
      return { sent: false, error: error.message };
    }
    await writeNotificationLog({
      booking_id: params.bookingId ?? null,
      channel: "email",
      template_key: params.templateKey,
      recipient: params.to,
      status: "sent",
      error: null,
      provider: "resend",
      role: "customer",
      event_type: params.logEventType,
      payload: params.payload ?? { source: "legacy_html" },
    });
    return { sent: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await writeNotificationLog({
      booking_id: params.bookingId ?? null,
      channel: "email",
      template_key: params.templateKey,
      recipient: params.to,
      status: "failed",
      error: msg,
      provider: "resend",
      role: "customer",
      event_type: params.logEventType,
      payload: params.payload ?? { source: "legacy_html" },
    });
    return { sent: false, error: msg };
  }
}

/**
 * Tries the active DB template first; falls back to legacy inline HTML when missing or send fails.
 */
export async function sendCustomerEmailWithDbTemplateFallback(params: {
  to: string;
  templateKey: string;
  data: Record<string, unknown>;
  bookingId?: string | null;
  logEventType: string;
  legacyTemplateKey?: string;
  buildLegacy: () => { subject: string; html: string };
  legacyPayload?: Record<string, unknown>;
}): Promise<{ sent: boolean; error?: string }> {
  const dbAttempt = await trySendCustomerEmailFromDbTemplate({
    to: params.to,
    templateKey: params.templateKey,
    data: params.data,
    bookingId: params.bookingId,
    logEventType: params.logEventType,
  });
  if (dbAttempt.usedRow && dbAttempt.sent) return { sent: true };

  if (dbAttempt.usedRow && !dbAttempt.sent) {
    await logSystemEvent({
      level: "warn",
      source: "email",
      message: "Customer email fell back to legacy HTML after DB template send failed",
      context: {
        templateKey: params.templateKey,
        bookingId: params.bookingId ?? null,
        priorError: dbAttempt.error ?? null,
      },
    });
  }

  const legacy = params.buildLegacy();
  return sendLegacyCustomerEmail({
    to: params.to,
    subject: legacy.subject,
    html: legacy.html,
    bookingId: params.bookingId,
    templateKey: params.legacyTemplateKey ?? `legacy_${params.templateKey}_html`,
    logEventType: params.logEventType,
    payload: {
      ...(params.legacyPayload ?? {}),
      source: "legacy_html",
      after_template_failure: dbAttempt.usedRow,
      prior_template_error: dbAttempt.usedRow ? (dbAttempt.error ?? null) : null,
    },
  });
}

export async function sendAdminEmailWithDbTemplateFallback(params: {
  templateKey: string;
  data: Record<string, unknown>;
  bookingId?: string | null;
  logEventType: string;
  legacySubject: string;
  legacyHtml: string;
  sendLegacy: () => Promise<{ sent: boolean; error?: string }>;
}): Promise<{ sent: boolean; error?: string }> {
  const adminEmail = process.env.ADMIN_NOTIFICATION_EMAIL?.trim();
  const template = adminEmail ? await getTemplate(params.templateKey, "email") : null;

  if (template && adminEmail) {
    const result = await sendEmailFromTemplateKey({
      to: adminEmail,
      key: params.templateKey,
      data: params.data,
      bookingId: params.bookingId,
      logRole: "admin",
      logEventType: params.logEventType,
    });
    if (result.ok) return { sent: true };
    await reportOperationalIssue("warn", "sendAdminEmailWithDbTemplateFallback", result.error, {
      templateKey: params.templateKey,
      bookingId: params.bookingId ?? null,
    });
  }

  return params.sendLegacy();
}
