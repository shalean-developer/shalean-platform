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

/**
 * Lightweight ops ping: optional Slack-style webhook + optional single Resend email.
 */
export async function notifyOpsOfCleanerIssueReport(params: {
  admin: SupabaseClient;
  bookingId: string;
  cleanerId: string;
  reportId: string;
  reasonLabel: string;
  reasonKey: string;
}): Promise<void> {
  try {
    const appBase = getPublicAppUrlBase();
    const adminUrl = `${appBase.replace(/\/$/, "")}/admin/bookings/${params.bookingId}`;

    await postDispatchControlAlert(
      {
        errorType: "cleaner_issue_report",
        message: `New cleaner issue report: ${params.reasonLabel}`,
        bookingId: params.bookingId,
        cleanerId: params.cleanerId,
        dedupeKey: `cleaner_issue_report:${params.reportId}`,
        dedupeWindowMinutes: 5,
        extra: {
          reportId: params.reportId,
          reason_key: params.reasonKey,
          adminUrl,
        },
      },
      { supabase: params.admin },
    );

    const toRaw = process.env.CLEANER_ISSUE_OPS_NOTIFY_EMAIL?.trim();
    const to = toRaw ? normalizeEmail(toRaw) : null;
    if (!to) return;

    const resend = getResend();
    if (!resend) return;

    const from = getDefaultFromAddress();
    const subject = `[Shalean] Cleaner issue — booking ${params.bookingId.slice(0, 8)}…`;
    const text = [
      `Reason: ${params.reasonLabel} (${params.reasonKey})`,
      `Booking: ${params.bookingId}`,
      `Cleaner: ${params.cleanerId}`,
      `Report id: ${params.reportId}`,
      `Open: ${adminUrl}`,
    ].join("\n");

    try {
      await resend.emails.send({ from, to, subject, text });
    } catch {
      /* non-fatal */
    }
  } catch (e) {
    console.error("cleaner_issue_ops_notify_failed", e);
  }
}
