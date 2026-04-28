import type { SupabaseClient } from "@supabase/supabase-js";
import { getServiceLabel, parseBookingServiceId } from "@/components/booking/serviceCategories";
import { bookingFlowHref } from "@/lib/booking/bookingFlow";
import { sendAbandonedCheckoutReminderEmail } from "@/lib/email/sendBookingEmail";
import { getPublicAppUrlBase } from "@/lib/email/appUrl";
import { logPipelineEmailTelemetry } from "@/lib/notifications/notificationEmailTelemetry";
import { tryClaimNotificationDedupe } from "@/lib/notifications/notificationDedupe";

const MIN_AGE_MIN = 18;
const MAX_AGE_MIN = 40;

export type AbandonCheckoutReminderResult = { attempted: number; sent: number; skipped: number };

/**
 * One email per unpaid booking, ~18–40 minutes after creation (cron-safe window).
 */
export async function processAbandonCheckoutReminders(
  supabase: SupabaseClient,
  opts?: { limit?: number },
): Promise<AbandonCheckoutReminderResult> {
  const limit = opts?.limit ?? 20;
  const now = Date.now();
  const minCreated = new Date(now - MAX_AGE_MIN * 60 * 1000).toISOString();
  const maxCreated = new Date(now - MIN_AGE_MIN * 60 * 1000).toISOString();

  const { data: rows, error } = await supabase
    .from("bookings")
    .select("id, customer_email, customer_name, service, created_at, status")
    .eq("status", "pending_payment")
    .gte("created_at", minCreated)
    .lte("created_at", maxCreated)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) {
    console.error("[abandonCheckoutReminder]", error.message);
    return { attempted: 0, sent: 0, skipped: 0 };
  }

  let attempted = 0;
  let sent = 0;
  let skipped = 0;
  const base = getPublicAppUrlBase();
  const checkoutUrl = `${base}${bookingFlowHref("checkout")}`;

  for (const raw of rows ?? []) {
    const row = raw as {
      id: string;
      customer_email?: string | null;
      customer_name?: string | null;
      service?: string | null;
    };
    const email = String(row.customer_email ?? "").trim();
    if (!email || !email.includes("@")) {
      skipped++;
      continue;
    }

    const claimed = await tryClaimNotificationDedupe(supabase, "abandon_checkout_reminder_sent", {
      bookingId: row.id,
    });
    if (!claimed) {
      skipped++;
      continue;
    }

    attempted++;
    const firstName = String(row.customer_name ?? "").trim().split(/\s+/)[0] || "there";
    const serviceId = parseBookingServiceId(row.service);
    const serviceLabel = serviceId != null ? getServiceLabel(serviceId) : "Cleaning";
    const r = await sendAbandonedCheckoutReminderEmail({
      customerEmail: email,
      firstName,
      checkoutUrl,
      serviceLabel,
    });
    if (r.sent) sent++;
    else skipped++;
    await logPipelineEmailTelemetry({
      role: "customer",
      channel: "abandon_checkout_reminder",
      sent: r.sent,
      error: r.error,
      bookingId: row.id,
    });
  }

  return { attempted, sent, skipped };
}
