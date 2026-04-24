import { sendAdminHtmlEmail } from "@/lib/email/sendBookingEmail";
import { logSystemEvent, reportOperationalIssue } from "@/lib/logging/systemLog";
import {
  clearWhatsappPause,
  getNotificationRuntimeFlags,
  getWhatsappDisabledUntilIso,
  setWhatsappDisabledUntil,
} from "@/lib/notifications/notificationRuntimeFlags";
import type { SupabaseClient } from "@supabase/supabase-js";

const ALERT_SOURCE = "notification_health_alert";
const CRITICAL_SOURCE = "notification_critical_escalation";

export type NotificationHealthWindow = {
  sinceIso: string;
  whatsapp: { sent: number; failed: number; rate: number | null };
  sms: { sent: number; failed: number };
  email: { sent: number; failed: number };
  rowCount: number;
};

const WA_RATE_MIN_ATTEMPTS = 8;
const WA_RATE_THRESHOLD = 0.8;
const WA_AUTO_PAUSE_RATE = 0.5;
const WA_AUTO_PAUSE_MIN_ATTEMPTS = 6;
const WA_RESUME_RATE = 0.85;
const WA_RESUME_MIN_ATTEMPTS = 6;
const EMAIL_FAIL_THRESHOLD = 6;
const SMS_FAIL_SPIKE = 10;
const ALL_CHANNELS_SMS_FAIL_MIN = 3;
const ALL_CHANNELS_EMAIL_FAIL_MIN = 3;

function whatsappPauseMinutes(): number {
  const n = Number(process.env.NOTIFICATION_WHATSAPP_PAUSE_MINUTES ?? "45");
  return Number.isFinite(n) && n >= 5 ? Math.min(24 * 60, Math.round(n)) : 45;
}

/** Min time since last auto-pause before early resume (reduces pause/resume oscillation). */
function whatsappResumeCooldownMinutes(): number {
  const n = Number(process.env.NOTIFICATION_WHATSAPP_RESUME_COOLDOWN_MINUTES ?? "12");
  return Number.isFinite(n) && n >= 0 ? Math.min(24 * 60, Math.round(n)) : 12;
}

function dedupeMinutes(): number {
  const n = Number(process.env.NOTIFICATION_HEALTH_DEDUP_MINUTES ?? "45");
  return Number.isFinite(n) && n >= 5 ? Math.min(240, Math.round(n)) : 45;
}

async function wasAlertSentRecently(
  admin: SupabaseClient,
  alertKey: string,
  sinceIso: string,
  logSource: string = ALERT_SOURCE,
): Promise<boolean> {
  const { data, error } = await admin
    .from("system_logs")
    .select("id, context, created_at")
    .eq("source", logSource)
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: false })
    .limit(40);
  if (error || !data?.length) return false;
  return data.some((row) => {
    const ctx = row && typeof row.context === "object" && row.context ? (row.context as Record<string, unknown>) : {};
    return ctx.alertKey === alertKey;
  });
}

async function recordAlert(alertKey: string, summary: Record<string, unknown>): Promise<void> {
  await logSystemEvent({
    level: "warn",
    source: ALERT_SOURCE,
    message: `Notification health: ${alertKey}`,
    context: { alertKey, ...summary },
  });
}

async function notifyAdminsHtml(subject: string, html: string): Promise<void> {
  try {
    await sendAdminHtmlEmail({
      subject,
      html,
      context: { type: "notification_health" },
    });
  } catch {
    await reportOperationalIssue("warn", "notification_health/admin_email", "sendAdminHtmlEmail failed or not configured", {
      subject,
    });
  }
}

async function notifyAdminsCritical(subject: string, html: string, context: Record<string, unknown>): Promise<void> {
  await logSystemEvent({
    level: "error",
    source: CRITICAL_SOURCE,
    message: subject,
    context,
  });
  try {
    await sendAdminHtmlEmail({
      subject,
      html,
      context: { type: "notification_critical" },
    });
  } catch {
    await reportOperationalIssue("error", "notification_critical/admin_email", "sendAdminHtmlEmail failed or not configured", {
      subject,
    });
  }
}

/**
 * Aggregates `notification_logs` since `sinceIso` and optionally emails admins when thresholds breach.
 * Dedupes per `alertKey` using `system_logs` rows with source `notification_health_alert`.
 */
export async function runNotificationHealthCheck(params: {
  admin: SupabaseClient;
  sinceIso: string;
}): Promise<{ window: NotificationHealthWindow; alerts: string[] }> {
  const { admin, sinceIso } = params;
  const alerts: string[] = [];

  const { data: rows, error } = await admin
    .from("notification_logs")
    .select("channel, status, error")
    .gte("created_at", sinceIso)
    .limit(25000);

  if (error) {
    await reportOperationalIssue("error", "notification_health/query", error.message, { sinceIso });
    throw new Error(error.message);
  }

  let emailSent = 0;
  let emailFailed = 0;
  let whatsappSent = 0;
  let whatsappFailed = 0;
  let smsSent = 0;
  let smsFailed = 0;
  /** WhatsApp outcomes excluding circuit-pause rows (used for early resume). */
  let waResumeSent = 0;
  let waResumeFailed = 0;
  for (const r of rows ?? []) {
    const ch = String((r as { channel?: string }).channel ?? "");
    const st = String((r as { status?: string }).status ?? "");
    const err = String((r as { error?: string | null }).error ?? "");
    if (ch === "email") {
      if (st === "sent") emailSent++;
      else if (st === "failed") emailFailed++;
    } else if (ch === "whatsapp") {
      if (st === "sent") {
        whatsappSent++;
        waResumeSent++;
      } else if (st === "failed") {
        whatsappFailed++;
        if (err !== "whatsapp_channel_paused") waResumeFailed++;
      }
    } else if (ch === "sms") {
      if (st === "sent") smsSent++;
      else if (st === "failed") smsFailed++;
    }
  }

  const waTotal = whatsappSent + whatsappFailed;
  const waRate = waTotal > 0 ? whatsappSent / waTotal : null;

  const window: NotificationHealthWindow = {
    sinceIso,
    whatsapp: { sent: whatsappSent, failed: whatsappFailed, rate: waRate },
    sms: { sent: smsSent, failed: smsFailed },
    email: { sent: emailSent, failed: emailFailed },
    rowCount: (rows ?? []).length,
  };

  const dedupeSince = new Date(Date.now() - dedupeMinutes() * 60_000).toISOString();

  if (waRate != null && waTotal >= WA_RATE_MIN_ATTEMPTS && waRate < WA_RATE_THRESHOLD) {
    const key = "whatsapp_success_rate_low";
    if (!(await wasAlertSentRecently(admin, key, dedupeSince))) {
      alerts.push(key);
      await recordAlert(key, { waRate, waTotal, sinceIso });
      await notifyAdminsHtml(
        `[ALERT] WhatsApp delivery degraded (${Math.round(waRate * 100)}% success, n=${waTotal})`,
        `<p>WhatsApp success rate over the monitoring window is below ${Math.round(WA_RATE_THRESHOLD * 100)}%.</p>
        <pre style="font-size:12px">${JSON.stringify(window.whatsapp, null, 2)}</pre>
        <p>Window since: <code>${sinceIso}</code></p>`,
      );
    }
  }

  if (smsFailed >= SMS_FAIL_SPIKE) {
    const key = "sms_failures_spike";
    if (!(await wasAlertSentRecently(admin, key, dedupeSince))) {
      alerts.push(key);
      await recordAlert(key, { smsFailed, sinceIso });
      await notifyAdminsHtml(
        `[ALERT] SMS failures spike (${smsFailed} failures)`,
        `<p>SMS failed sends in the window: <strong>${smsFailed}</strong> (threshold ${SMS_FAIL_SPIKE}).</p>
        <pre style="font-size:12px">${JSON.stringify(window.sms, null, 2)}</pre>`,
      );
    }
  }

  if (emailFailed >= EMAIL_FAIL_THRESHOLD) {
    const key = "email_failures_high";
    if (!(await wasAlertSentRecently(admin, key, dedupeSince))) {
      alerts.push(key);
      await recordAlert(key, { emailFailed, sinceIso });
      await notifyAdminsHtml(
        `[ALERT] Email failures elevated (${emailFailed})`,
        `<p>Email failed sends in the window: <strong>${emailFailed}</strong> (threshold ${EMAIL_FAIL_THRESHOLD}).</p>
        <pre style="font-size:12px">${JSON.stringify(window.email, null, 2)}</pre>`,
      );
    }
  }

  let didAutoPauseThisRun = false;
  if (waRate != null && waTotal >= WA_AUTO_PAUSE_MIN_ATTEMPTS && waRate < WA_AUTO_PAUSE_RATE) {
    const pauseM = whatsappPauseMinutes();
    const untilIso = new Date(Date.now() + pauseM * 60_000).toISOString();
    await setWhatsappDisabledUntil(untilIso);
    didAutoPauseThisRun = true;
    const key = "whatsapp_channel_auto_paused";
    if (!(await wasAlertSentRecently(admin, key, dedupeSince))) {
      alerts.push(key);
      await recordAlert(key, { waRate, waTotal, untilIso, pauseMinutes: pauseM, sinceIso });
      await notifyAdminsHtml(
        `[ACTION] WhatsApp paused ${pauseM}m (success ${Math.round(waRate * 100)}%, n=${waTotal})`,
        `<p>Outbound WhatsApp was automatically paused until <code>${untilIso}</code> (UTC). SMS fallbacks will run first.</p>
        <p>Adjust <code>NOTIFICATION_WHATSAPP_PAUSE_MINUTES</code> or clear row <code>notification_runtime_flags.whatsapp_disabled_until</code> to recover early.</p>`,
      );
    }
  }

  const pausedIso = await getWhatsappDisabledUntilIso();
  const waCircuitActive = pausedIso != null && new Date(pausedIso).getTime() > Date.now();
  const waResumeTotal = waResumeSent + waResumeFailed;
  const waResumeRate = waResumeTotal > 0 ? waResumeSent / waResumeTotal : null;
  const flagsRow = await getNotificationRuntimeFlags();
  const pausedAtMs = flagsRow?.whatsapp_paused_at ? new Date(flagsRow.whatsapp_paused_at).getTime() : NaN;
  const cooldownMin = whatsappResumeCooldownMinutes();
  const cooldownOk =
    !Number.isFinite(pausedAtMs) ||
    Date.now() - pausedAtMs >= cooldownMin * 60_000;
  if (
    !didAutoPauseThisRun &&
    waCircuitActive &&
    cooldownOk &&
    waResumeRate != null &&
    waResumeTotal >= WA_RESUME_MIN_ATTEMPTS &&
    waResumeRate > WA_RESUME_RATE
  ) {
    await clearWhatsappPause();
    const resumeKey = "whatsapp_channel_auto_resumed";
    if (!(await wasAlertSentRecently(admin, resumeKey, dedupeSince))) {
      alerts.push(resumeKey);
      await recordAlert(resumeKey, {
        waResumeRate,
        waResumeTotal,
        sinceIso,
        priorPauseUntil: pausedIso,
        resumeCooldownMinutes: cooldownMin,
        whatsapp_paused_at: flagsRow?.whatsapp_paused_at ?? null,
      });
      await notifyAdminsHtml(
        `[RECOVERY] WhatsApp circuit cleared early (${Math.round(waResumeRate * 100)}% success on ${waResumeTotal} non-pause attempts)`,
        `<p>WhatsApp auto-pause was cleared before timeout because recent sends (excluding <code>whatsapp_channel_paused</code> rows) exceeded the resume threshold.</p>
        <pre style="font-size:12px">${JSON.stringify({ waResumeSent, waResumeFailed, waResumeRate }, null, 2)}</pre>`,
      );
    }
  }

  if (
    waCircuitActive &&
    smsFailed >= ALL_CHANNELS_SMS_FAIL_MIN &&
    emailFailed >= ALL_CHANNELS_EMAIL_FAIL_MIN
  ) {
    const critKey = "all_channels_degraded";
    if (!(await wasAlertSentRecently(admin, critKey, dedupeSince, CRITICAL_SOURCE))) {
      alerts.push(critKey);
      await notifyAdminsCritical(
        `[CRITICAL] All outbound channels degraded (WhatsApp paused + SMS + email failures)`,
        `<p><strong>WhatsApp</strong> is circuit-paused until <code>${pausedIso}</code> (UTC).</p>
        <p><strong>SMS</strong> failures in window: ${smsFailed} (≥${ALL_CHANNELS_SMS_FAIL_MIN}).</p>
        <p><strong>Email</strong> failures in window: ${emailFailed} (≥${ALL_CHANNELS_EMAIL_FAIL_MIN}).</p>
        <p>Investigate Meta, Twilio, and Resend immediately.</p>
        <pre style="font-size:12px">${JSON.stringify(window, null, 2)}</pre>`,
        {
          alertKey: critKey,
          smsFailed,
          emailFailed,
          pausedUntil: pausedIso,
          sinceIso,
        },
      );
    }
  }

  return { window, alerts };
}
