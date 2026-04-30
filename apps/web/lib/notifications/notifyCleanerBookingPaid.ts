import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { bookingJobDisplayRef } from "@/lib/booking/cleanerJobAssignedWhatsApp";
import { customerPhoneToE164 } from "@/lib/notifications/customerPhoneNormalize";
import { logSystemEvent, reportOperationalIssue } from "@/lib/logging/systemLog";
import { sendSmsFallback } from "@/lib/notifications/smsFallback";

const CLEANER_PAID_SMS_COOLDOWN_SEC = 120;

async function cleanerPaidSmsRecentlySent(admin: SupabaseClient, bookingId: string): Promise<boolean> {
  const since = new Date(Date.now() - CLEANER_PAID_SMS_COOLDOWN_SEC * 1000).toISOString();
  const { count, error } = await admin
    .from("notification_logs")
    .select("id", { count: "exact", head: true })
    .eq("booking_id", bookingId)
    .eq("template_key", "cleaner_booking_paid_off_platform")
    .eq("channel", "sms")
    .eq("status", "sent")
    .gte("created_at", since);
  if (error) {
    await reportOperationalIssue("warn", "notifyCleanerBookingPaid", `cooldown_query: ${error.message}`, {
      bookingId,
    });
    return false;
  }
  return (count ?? 0) > 0;
}

/**
 * Best-effort SMS when a booking is marked paid off-platform and a cleaner is already assigned.
 * Does not throw; failures are logged only.
 */
export async function notifyCleanerBookingPaid(params: {
  admin: SupabaseClient;
  bookingId: string;
  cleanerId: string;
  method: "cash" | "zoho";
  externalReference?: string | null;
}): Promise<void> {
  const { admin, bookingId, cleanerId, method, externalReference } = params;
  try {
    if (await cleanerPaidSmsRecentlySent(admin, bookingId)) {
      await logSystemEvent({
        level: "info",
        source: "notifyCleanerBookingPaid",
        message: "skip_duplicate_sms_cooldown",
        context: { bookingId, cleanerId, cooldownSec: CLEANER_PAID_SMS_COOLDOWN_SEC },
      });
      return;
    }

    const { data: cRow, error: cErr } = await admin
      .from("cleaners")
      .select("phone_number, full_name")
      .eq("id", cleanerId)
      .maybeSingle();
    if (cErr || !cRow) {
      await logSystemEvent({
        level: "warn",
        source: "notifyCleanerBookingPaid",
        message: "cleaner row missing",
        context: { bookingId, cleanerId },
      });
      return;
    }
    const phoneRaw = String((cRow as { phone_number?: string | null }).phone_number ?? "").trim();
    const name = String((cRow as { full_name?: string | null }).full_name ?? "").trim();
    const firstName = name.split(/\s+/)[0]?.trim() || "there";
    const e164 = customerPhoneToE164(phoneRaw);
    if (!e164) {
      await logSystemEvent({
        level: "warn",
        source: "notifyCleanerBookingPaid",
        message: "no_cleaner_phone_e164",
        context: { bookingId, cleanerId },
      });
      return;
    }
    const jobRef = bookingJobDisplayRef(bookingId);
    const channel = method === "cash" ? "Cash" : "Zoho";
    const refLine =
      method === "zoho" && externalReference != null && String(externalReference).trim()
        ? ` Ref: ${String(externalReference).trim().slice(0, 40)}.`
        : "";
    const body = `Shalean: Customer payment confirmed (${channel}) for ${jobRef}.${refLine} Hi ${firstName} — you're all set for this job.`.slice(
      0,
      480,
    );

    const smsRes = await sendSmsFallback({
      toE164: e164,
      body,
      context: { bookingId, cleanerId, method },
      smsRole: "primary",
      recipientKind: "cleaner",
      deliveryLog: {
        templateKey: "cleaner_booking_paid_off_platform",
        bookingId,
        eventType: "admin_mark_paid",
        role: "cleaner",
      },
    });
    if (!smsRes.sent && smsRes.error) {
      await reportOperationalIssue("warn", "notifyCleanerBookingPaid", smsRes.error, { bookingId, cleanerId });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await reportOperationalIssue("warn", "notifyCleanerBookingPaid", msg, { bookingId, cleanerId });
  }
}
