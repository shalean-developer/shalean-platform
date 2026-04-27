import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { CustomerPaymentLinkWhatsAppPayload } from "@/lib/templates/customerOutbound";
import { sendCustomerSmsPaymentLink } from "@/lib/templates/customerOutbound";
import type { PaymentLinkEmailInput } from "@/lib/email/sendBookingEmail";
import { sendPaymentLinkEmail } from "@/lib/email/sendBookingEmail";
import type { PaymentLinkDeliveryJson } from "@/lib/admin/persistPaymentLinkDelivery";
import { logSystemEvent, reportOperationalIssue } from "@/lib/logging/systemLog";

export function paymentLinkEmailDelaySecondsCap(): number {
  const raw = Number(process.env.PAYMENT_LINK_EXPERIMENT_DELAY_SECONDS ?? "0");
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  return Math.min(Math.floor(raw), 900);
}

/** When delay > 0, use DB queue unless `PAYMENT_LINK_EXPERIMENT_DELAY_INLINE=true`. */
export function useAsyncPaymentLinkEmailDelay(): boolean {
  if (paymentLinkEmailDelaySecondsCap() <= 0) return false;
  return String(process.env.PAYMENT_LINK_EXPERIMENT_DELAY_INLINE ?? "").toLowerCase() !== "true";
}

export async function enqueueDeferredPaymentLinkEmail(
  admin: SupabaseClient,
  params: {
    bookingId: string;
    delaySeconds: number;
    emailPayload: PaymentLinkEmailInput;
    phone: string | null;
    waPayload: CustomerPaymentLinkWhatsAppPayload;
    context: Record<string, unknown>;
  },
): Promise<{ runAtIso: string }> {
  const sec = Math.max(1, Math.min(Math.floor(params.delaySeconds), 900));
  const runAt = new Date(Date.now() + sec * 1000).toISOString();
  const bid = params.bookingId.trim();

  await admin.from("conversion_deferred_payment_link_emails").delete().eq("booking_id", bid).is("sent_at", null);

  const { error } = await admin.from("conversion_deferred_payment_link_emails").insert({
    booking_id: bid,
    run_at: runAt,
    email_payload: params.emailPayload as unknown as Record<string, unknown>,
    phone: params.phone?.trim() || null,
    wa_payload: params.waPayload as unknown as Record<string, unknown>,
    delivery_context: params.context as Record<string, unknown>,
  });

  if (error) {
    await reportOperationalIssue("error", "deferred_payment_link_email", error.message, { bookingId: bid });
    throw new Error(error.message);
  }

  await logSystemEvent({
    level: "info",
    source: "deferred_payment_link_email",
    message: "queued",
    context: { bookingId: bid, run_at: runAt, delay_seconds: sec },
  });

  return { runAtIso: runAt };
}

type DeferredRow = {
  id: string;
  booking_id: string;
  email_payload: PaymentLinkEmailInput;
  phone: string | null;
  wa_payload: CustomerPaymentLinkWhatsAppPayload | null;
  delivery_context: Record<string, unknown>;
};

/**
 * Cron/worker: send due deferred emails; on hard email failure, SMS fallback matches email-first policy.
 */
async function mergeDeferredEmailCompletion(
  admin: SupabaseClient,
  bookingId: string,
  patch: Partial<PaymentLinkDeliveryJson>,
): Promise<void> {
  const { data: row } = await admin.from("bookings").select("payment_link_delivery").eq("id", bookingId).maybeSingle();
  const prev =
    row && typeof row === "object" && "payment_link_delivery" in row && row.payment_link_delivery != null
      ? (row.payment_link_delivery as Record<string, unknown>)
      : {};
  const next = {
    ...(typeof prev === "object" && prev !== null && !Array.isArray(prev) ? prev : {}),
    ...patch,
  };
  const { error } = await admin.from("bookings").update({ payment_link_delivery: next }).eq("id", bookingId);
  if (error) {
    await reportOperationalIssue("warn", "deferred_payment_link_email/merge_delivery", error.message, { bookingId });
  }
}

export async function processDueDeferredPaymentLinkEmails(
  admin: SupabaseClient,
  params?: { limit?: number },
): Promise<{ processed: number; emailed: number; smsFallback: number; errors: number }> {
  const limit = Math.min(50, Math.max(1, params?.limit ?? 25));
  const nowIso = new Date().toISOString();

  const { data: rows, error } = await admin
    .from("conversion_deferred_payment_link_emails")
    .select("id, booking_id, email_payload, phone, wa_payload, delivery_context")
    .is("sent_at", null)
    .lte("run_at", nowIso)
    .order("run_at", { ascending: true })
    .limit(limit);

  if (error) {
    await reportOperationalIssue("error", "deferred_payment_link_email/process", error.message);
    return { processed: 0, emailed: 0, smsFallback: 0, errors: 1 };
  }

  let emailed = 0;
  let smsFallback = 0;
  let errors = 0;

  for (const raw of rows ?? []) {
    const row = raw as DeferredRow;
    const ctx = (row.delivery_context ?? {}) as Record<string, unknown>;
    const em = await sendPaymentLinkEmail(row.email_payload);
    if (em.sent) {
      emailed++;
      await admin
        .from("conversion_deferred_payment_link_emails")
        .update({ sent_at: new Date().toISOString(), last_error: null })
        .eq("id", row.id);
      await mergeDeferredEmailCompletion(admin, row.booking_id, {
        email: "sent",
        email_deferred_until: null,
        updated_at: new Date().toISOString(),
      });
      await logSystemEvent({
        level: "info",
        source: "deferred_payment_link_email",
        message: "sent",
        context: { bookingId: row.booking_id, deferred_id: row.id },
      });
      continue;
    }

    const phone = typeof row.phone === "string" ? row.phone.trim() : "";
    const wa = row.wa_payload;
    let smsOk = false;
    if (phone && wa && typeof wa === "object") {
      const sms = await sendCustomerSmsPaymentLink({
        phone,
        payload: wa,
        context: { ...ctx, bookingId: row.booking_id, stage: "deferred_email_failed_sms_fallback" },
        smsRole: "fallback",
      });
      smsOk = sms.ok;
      if (smsOk) smsFallback++;
    }

    if (!smsOk) errors++;
    await admin
      .from("conversion_deferred_payment_link_emails")
      .update({ sent_at: new Date().toISOString(), last_error: em.error ?? "email_failed" })
      .eq("id", row.id);
    await mergeDeferredEmailCompletion(admin, row.booking_id, {
      email: "failed",
      sms: smsOk ? "sent" : "skipped",
      sms_role: smsOk ? "fallback" : null,
      email_deferred_until: null,
      updated_at: new Date().toISOString(),
    });
    await logSystemEvent({
      level: "warn",
      source: "deferred_payment_link_email",
      message: smsOk ? "email_failed_sms_fallback_ok" : "email_failed_no_sms",
      context: { bookingId: row.booking_id, deferred_id: row.id, error: em.error },
    });
  }

  return { processed: (rows ?? []).length, emailed, smsFallback, errors };
}
