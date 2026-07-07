import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { getPublicAppUrlBase } from "@/lib/email/appUrl";
import { normalizeEmail } from "@/lib/booking/normalizeEmail";
import { getDefaultFromAddress } from "@/lib/email/resendFrom";
import { postDispatchControlAlert } from "@/lib/ops/dispatchControlWebhook";

function getResend(): Resend | null {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) return null;
  return new Resend(key);
}

function resolveOpsNotifyEmail(): string | null {
  const dedicated = process.env.CLEANER_ANONYMOUS_REPORT_OPS_NOTIFY_EMAIL?.trim();
  const fallback = process.env.CLEANER_ISSUE_OPS_NOTIFY_EMAIL?.trim();
  const raw = dedicated || fallback;
  return raw ? normalizeEmail(raw) : null;
}

/**
 * Ops ping for anonymous cleaner reports. Does not include reporter identity in email or webhook.
 */
export async function notifyOpsOfAnonymousCleanerReport(params: {
  admin: SupabaseClient;
  reportId: string;
  subject: string | null;
  message: string;
}): Promise<void> {
  try {
    const appBase = getPublicAppUrlBase();
    const adminUrl = `${appBase.replace(/\/$/, "")}/office/cleaner-report-feedback`;
    const topicLabel = params.subject?.trim() || "General concern";

    await postDispatchControlAlert(
      {
        errorType: "cleaner_anonymous_report",
        message: `New anonymous cleaner report: ${topicLabel}`,
        dedupeKey: `cleaner_anonymous_report:${params.reportId}`,
        dedupeWindowMinutes: 5,
        extra: {
          reportId: params.reportId,
          subject: params.subject,
          adminUrl,
          anonymous: true,
        },
      },
      { supabase: params.admin },
    );

    const to = resolveOpsNotifyEmail();
    if (!to) return;

    const resend = getResend();
    if (!resend) return;

    const from = getDefaultFromAddress();
    const subject = `[Shalean] Anonymous cleaner report — ${topicLabel}`;
    const text = [
      "A cleaner submitted an anonymous report.",
      "",
      "Reporter identity: withheld",
      `Topic: ${topicLabel}`,
      `Report id: ${params.reportId}`,
      "",
      "Message:",
      params.message,
      "",
      `Review in office: ${adminUrl}`,
    ].join("\n");

    try {
      await resend.emails.send({ from, to, subject, text });
    } catch {
      /* non-fatal */
    }
  } catch (e) {
    console.error("cleaner_anonymous_report_ops_notify_failed", e);
  }
}
