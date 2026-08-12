import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { CustomerPaymentLinkWhatsAppPayload } from "@/lib/templates/customerOutbound";
import { sendCustomerSmsPaymentLink } from "@/lib/templates/customerOutbound";
import type { PaymentLinkEmailInput } from "@/lib/email/sendBookingEmail";
import { sendPaymentLinkEmail } from "@/lib/email/sendBookingEmail";
import type { PaymentLinkDeliveryJson } from "@/lib/admin/persistPaymentLinkDelivery";
import { logSystemEvent, reportOperationalIssue } from "@/lib/logging/systemLog";

const DEFERRED_EMAIL_MAX_FAILURES = 3;
const DEFERRED_EMAIL_RETRY_BASE_SECONDS = 300;

export function paymentLinkEmailDelaySecondsCap(): number {
  const raw = Number(process.env.PAYMENT_LINK_EXPERIMENT_DELAY_SECONDS ?? "0");
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  return Math.min(Math.floor(raw), 900);
}

/** When delay > 0, use DB queue unless `PAYMENT_LINK_EXPERIMENT_DELAY_INLINE=true`. */
export function isAsyncPaymentLinkEmailDelayEnabled(): boolean {
  if (paymentLinkEmailDelaySecondsCap() <= 0) return false;
  return String(process.env.PAYMENT_LINK_EXPERIMENT_DELAY_INLINE ?? "").toLowerCase() !== "true";
}

function deferredEmailFailureCount(context: Record<string, unknown>): number {
  const raw = Number(context.deferred_email_failure_count ?? 0);
  if (!Number.isFinite(raw) || raw < 0) return 0;
  return Math.floor(raw);
}

export function deferredEmailRetryDelaySeconds(failureCount: number): number {
  const attempt = Math.max(1, Math.floor(failureCount));
  return Math.min(DEFERRED_EMAIL_RETRY_BASE_SECONDS * 3 ** (attempt - 1), 3600);
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
  processing_token: string;
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

async function completeClaim(
  admin: SupabaseClient,
  row: DeferredRow,
  patch: { last_error: string | null },
): Promise<boolean> {
  const { data, error } = await admin
    .from("conversion_deferred_payment_link_emails")
    .update({
      sent_at: new Date().toISOString(),
      last_error: patch.last_error,
      processing_started_at: null,
      processing_token: null,
    })
    .eq("id", row.id)
    .eq("processing_token", row.processing_token)
    .is("sent_at", null)
    .select("id")
    .maybeSingle();

  if (error || !data) {
    await reportOperationalIssue(
      "error",
      "deferred_payment_link_email/complete_claim",
      error?.message ?? "claim_lost_before_completion",
      { bookingId: row.booking_id, deferredId: row.id },
    );
    return false;
  }
  return true;
}

async function releaseClaimForRetry(
  admin: SupabaseClient,
  row: DeferredRow,
  errorMessage: string,
): Promise<{ released: boolean; failureCount: number; runAtIso: string | null }> {
  const failureCount = deferredEmailFailureCount(row.delivery_context ?? {}) + 1;
  if (failureCount >= DEFERRED_EMAIL_MAX_FAILURES) {
    return { released: false, failureCount, runAtIso: null };
  }

  const runAtIso = new Date(Date.now() + deferredEmailRetryDelaySeconds(failureCount) * 1000).toISOString();
  const { data, error } = await admin
    .from("conversion_deferred_payment_link_emails")
    .update({
      run_at: runAtIso,
      last_error: errorMessage,
      delivery_context: {
        ...(row.delivery_context ?? {}),
        deferred_email_failure_count: failureCount,
        deferred_email_last_failed_at: new Date().toISOString(),
      },
      processing_started_at: null,
      processing_token: null,
    })
    .eq("id", row.id)
    .eq("processing_token", row.processing_token)
    .is("sent_at", null)
    .select("id")
    .maybeSingle();

  if (error || !data) {
    await reportOperationalIssue(
      "error",
      "deferred_payment_link_email/release_claim",
      error?.message ?? "claim_lost_before_retry_release",
      { bookingId: row.booking_id, deferredId: row.id },
    );
    return { released: false, failureCount, runAtIso: null };
  }

  return { released: true, failureCount, runAtIso };
}

export type DeferredPaymentLinkEmailWorkerStats = {
  processed: number;
  emailed: number;
  smsFallback: number;
  retriesScheduled: number;
  deliveryFailures: number;
  errors: number;
};

export async function processDueDeferredPaymentLinkEmails(
  admin: SupabaseClient,
  params?: { limit?: number },
): Promise<DeferredPaymentLinkEmailWorkerStats> {
  const limit = Math.min(50, Math.max(1, params?.limit ?? 25));

  // The SQL function selects with FOR UPDATE SKIP LOCKED and stamps a unique
  // processing token in the same transaction. Parallel cron invocations therefore
  // cannot receive the same queue row.
  const { data: rows, error } = await admin.rpc("claim_due_deferred_payment_link_emails", {
    p_limit: limit,
    p_stale_after: "15 minutes",
  });

  if (error) {
    await reportOperationalIssue("error", "deferred_payment_link_email/process", error.message);
    return {
      processed: 0,
      emailed: 0,
      smsFallback: 0,
      retriesScheduled: 0,
      deliveryFailures: 0,
      errors: 1,
    };
  }

  let emailed = 0;
  let smsFallback = 0;
  let retriesScheduled = 0;
  let deliveryFailures = 0;
  let errors = 0;

  for (const raw of rows ?? []) {
    const row = raw as DeferredRow;
    if (!row.processing_token) {
      errors++;
      await reportOperationalIssue(
        "error",
        "deferred_payment_link_email/process",
        "claimed_row_missing_processing_token",
        { bookingId: row.booking_id, deferredId: row.id },
      );
      continue;
    }

    const ctx = (row.delivery_context ?? {}) as Record<string, unknown>;
    const em = await sendPaymentLinkEmail(row.email_payload);
    if (em.sent) {
      const completed = await completeClaim(admin, row, { last_error: null });
      if (!completed) {
        errors++;
        continue;
      }
      emailed++;
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

    const emailError = em.error ?? "email_failed";
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

    if (smsOk) {
      const completed = await completeClaim(admin, row, { last_error: emailError });
      if (!completed) {
        errors++;
        continue;
      }
      await mergeDeferredEmailCompletion(admin, row.booking_id, {
        email: "failed",
        sms: "sent",
        sms_role: "fallback",
        email_deferred_until: null,
        updated_at: new Date().toISOString(),
      });
      await logSystemEvent({
        level: "warn",
        source: "deferred_payment_link_email",
        message: "email_failed_sms_fallback_ok",
        context: { bookingId: row.booking_id, deferred_id: row.id, error: emailError },
      });
      continue;
    }

    const retry = await releaseClaimForRetry(admin, row, emailError);
    if (retry.released) {
      retriesScheduled++;
      await logSystemEvent({
        level: "warn",
        source: "deferred_payment_link_email",
        message: "email_failed_retry_scheduled",
        context: {
          bookingId: row.booking_id,
          deferred_id: row.id,
          error: emailError,
          failure_count: retry.failureCount,
          retry_at: retry.runAtIso,
        },
      });
      continue;
    }

    if (retry.failureCount < DEFERRED_EMAIL_MAX_FAILURES) {
      errors++;
      continue;
    }

    deliveryFailures++;
    const completed = await completeClaim(admin, row, { last_error: emailError });
    if (!completed) {
      errors++;
      continue;
    }
    await mergeDeferredEmailCompletion(admin, row.booking_id, {
      email: "failed",
      sms: "skipped",
      sms_role: null,
      email_deferred_until: null,
      updated_at: new Date().toISOString(),
    });
    await reportOperationalIssue("error", "deferred_payment_link_email/delivery_failed", emailError, {
      bookingId: row.booking_id,
      deferredId: row.id,
      failureCount: retry.failureCount,
    });
  }

  return {
    processed: (rows ?? []).length,
    emailed,
    smsFallback,
    retriesScheduled,
    deliveryFailures,
    errors,
  };
}
