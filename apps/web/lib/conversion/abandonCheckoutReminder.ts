import type { SupabaseClient } from "@supabase/supabase-js";
import { getServiceLabel, parseBookingServiceId } from "@/components/booking/serviceCategories";
import { bookingFlowHref } from "@/lib/booking/bookingFlow";
import { sendAbandonedCheckoutReminderEmail } from "@/lib/email/sendBookingEmail";
import { getPublicAppUrlBase } from "@/lib/email/appUrl";
import { logPipelineEmailTelemetry } from "@/lib/notifications/notificationEmailTelemetry";
import { tryClaimNotificationDedupe } from "@/lib/notifications/notificationDedupe";
import { sendCustomerSmsPaymentLink } from "@/lib/templates/customerOutbound";
import { CUSTOMER_SUPPORT_WHATSAPP_URL } from "@/lib/site/customerSupport";

const MIN_AGE_MIN = 18;
const MAX_AGE_MIN = 40;

export type AbandonCheckoutReminderResult = { attempted: number; sent: number; smsSent: number; skipped: number };

function buildSupportWhatsappRecoveryUrl(continueUrl: string, serviceLabel: string): string | null {
  try {
    const url = new URL(CUSTOMER_SUPPORT_WHATSAPP_URL);
    url.searchParams.set("text", `Hi Shalean, I want to continue my ${serviceLabel} booking. ${continueUrl}`);
    return url.toString();
  } catch {
    return null;
  }
}

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
    .select("id, customer_email, customer_name, customer_phone, service, date, time, total_paid_zar, paystack_reference, created_at, status")
    .eq("status", "pending_payment")
    .gte("created_at", minCreated)
    .lte("created_at", maxCreated)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) {
    console.error("[abandonCheckoutReminder]", error.message);
    return { attempted: 0, sent: 0, smsSent: 0, skipped: 0 };
  }

  let attempted = 0;
  let sent = 0;
  let smsSent = 0;
  let skipped = 0;
  const base = getPublicAppUrlBase();

  for (const raw of rows ?? []) {
    const row = raw as {
      id: string;
      customer_email?: string | null;
      customer_name?: string | null;
      customer_phone?: string | null;
      service?: string | null;
      date?: string | null;
      time?: string | null;
      total_paid_zar?: number | null;
      paystack_reference?: string | null;
    };
    const email = String(row.customer_email ?? "").trim();
    const phone = String(row.customer_phone ?? "").trim();
    const ref = String(row.paystack_reference ?? "").trim();
    if ((!email || !email.includes("@")) && (!phone || !ref)) {
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
    const checkoutUrl = ref
      ? `${base}/pay/${encodeURIComponent(row.id)}?ref=${encodeURIComponent(ref)}`
      : `${base}${bookingFlowHref("checkout")}`;
    const whatsappUrl = buildSupportWhatsappRecoveryUrl(checkoutUrl, serviceLabel);
    if (email && email.includes("@")) {
      const r = await sendAbandonedCheckoutReminderEmail({
        customerEmail: email,
        firstName,
        checkoutUrl,
        serviceLabel,
        whatsappUrl,
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

    if (phone && ref) {
      const sms = await sendCustomerSmsPaymentLink({
        phone,
        payload: {
          customerName: firstName,
          paymentLink: checkoutUrl,
          service: serviceLabel,
          date: String(row.date ?? "your selected date"),
          time: String(row.time ?? "your selected time"),
        },
        context: { bookingId: row.id, source: "abandon_checkout_recovery", paystack_reference: ref },
        smsRole: email && email.includes("@") ? "fallback" : "primary",
      });
      if (sms.ok) smsSent++;
    }
  }

  return { attempted, sent, smsSent, skipped };
}
