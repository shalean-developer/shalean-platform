/**
 * **Responsibility:** Paystack **authoritative** server webhook for **charge** events.
 * `charge.success` → {@link finalizePaidBooking} (checkout persistence). Not used for cleaner **transfer** webhooks (those live under `/api/webhooks/paystack`).
 * See `lib/booking/paystackRouteResponsibilityContract.ts`.
 */
import crypto from "crypto";
import { NextResponse } from "next/server";
import { enqueuePaystackRecoveryFailedJobs } from "@/lib/booking/enqueuePaystackRecoveryFailedJobs";
import { syncPaidBookingSideEffects } from "@/lib/booking/syncPaidBookingSideEffects";
import { normalizeEmail } from "@/lib/booking/normalizeEmail";
import { parseBookingSnapshot } from "@/lib/booking/paystackChargeTypes";
import { normalizePaystackMetadata } from "@/lib/booking/paystackMetadata";
import {
  bookingIdForPaystackReference,
  findBookingIdStatusForPaystackReference,
  PaystackDecoupledMetadataError,
  resolveInternalBookingIdFromPaystackReference,
  assertDecoupledPaystackMetadataAllowsFinalize,
} from "@/lib/booking/paystackBookingIdLookup";
import { replayPaymentConfirmedNotifyForPersistedBooking } from "@/lib/booking/paystackReplayPaymentConfirmedNotify";
import { finalizePaidBooking, upsertResultFromFinalizePaidBookingOp } from "@/lib/booking/bookingOperations";
import { routePaystackChargeForMonthlyInvoice } from "@/lib/booking/routePaystackChargeForMonthlyInvoice";
import {
  routePaystackChargeForSalesDocument,
} from "@/lib/salesDocument/routePaystackChargeForSalesDocument";
import { salesDocumentIdFromPaystackMetadata } from "@/lib/salesDocument/salesDocumentPaystackReference";
import { metrics } from "@/lib/metrics/counters";
import {
  expectedCheckoutZarFromVerify,
  pricingVersionIdFromLocked,
  recordPaystackPricingMismatch,
} from "@/lib/metrics/pricingMismatch";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { logSystemEvent, reportOperationalIssue } from "@/lib/logging/systemLog";
import { postDispatchControlAlert } from "@/lib/ops/dispatchControlWebhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) {
    return NextResponse.json({ error: "Paystack not configured." }, { status: 503 });
  }

  const rawBody = await request.text();
  const signature = request.headers.get("x-paystack-signature");

  const hash = crypto.createHmac("sha512", secret).update(rawBody).digest("hex");

  if (!signature || hash !== signature) {
    await reportOperationalIssue("warn", "paystack/webhook", "paystack.webhook.signature_invalid", {
      errorType: "paystack_webhook_signature_invalid",
    });
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let event: { event?: string; data?: Record<string, unknown> };
  try {
    event = JSON.parse(rawBody) as { event?: string; data?: Record<string, unknown> };
  } catch {
    await reportOperationalIssue("warn", "paystack/webhook", "paystack.webhook.invalid_json", {
      errorType: "paystack_webhook_invalid_json",
    });
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  await logSystemEvent({
    level: "info",
    source: "paystack/webhook",
    message: "Webhook hit (signature verified)",
    context: { event: event.event ?? null },
  });

  if (event.event === "charge.failed" && event.data) {
    const d = event.data as Record<string, unknown>;
    const reference =
      typeof d.reference === "string"
        ? d.reference
        : typeof (d as { reference?: unknown }).reference === "string"
          ? String((d as { reference: string }).reference)
          : "";
    const gateway =
      typeof d.gateway_response === "string"
        ? d.gateway_response.slice(0, 500)
        : JSON.stringify(d.gateway_response ?? d.message ?? "").slice(0, 500);
    await reportOperationalIssue("error", "paystack/webhook", "Paystack charge.failed (customer payment not completed)", {
      reference: reference || null,
      gateway_response: gateway || null,
      errorType: "payment_charge_failed",
    });
    const admin = getSupabaseAdmin();
    let bookingId: string | null = null;
    if (admin && reference) {
      const { data: b } = await admin.from("bookings").select("id").eq("paystack_reference", reference).maybeSingle();
      if (b && typeof (b as { id?: string }).id === "string") bookingId = (b as { id: string }).id;
      else {
        const meta = normalizePaystackMetadata(d.metadata);
        const internalId = resolveInternalBookingIdFromPaystackReference(reference, meta);
        if (internalId) {
          const { data: b2 } = await admin.from("bookings").select("id").eq("id", internalId).maybeSingle();
          if (b2 && typeof (b2 as { id?: string }).id === "string") bookingId = (b2 as { id: string }).id;
        }
      }
    }
    await postDispatchControlAlert(
      {
        errorType: "payment_charge_failed",
        message: "Paystack charge.failed (customer payment not completed)",
        bookingId,
        dedupeKey: reference ? `payment_charge_failed:${reference}` : "payment_charge_failed:unknown",
        dedupeWindowMinutes: 30,
        extra: { reference: reference || null, gateway_response: gateway || null },
      },
      { supabase: admin },
    );
    return NextResponse.json({ received: true });
  }

  if (event.event !== "charge.success" || !event.data) {
    return NextResponse.json({ received: true });
  }

  const data = event.data;
  const reference =
    typeof data.reference === "string"
      ? data.reference
      : typeof (data as { reference?: unknown }).reference === "string"
        ? String((data as { reference: string }).reference)
        : "";

  if (!reference) {
    await reportOperationalIssue("warn", "paystack/webhook", "charge.success missing reference");
    return NextResponse.json({ received: true });
  }

  await logSystemEvent({
    level: "info",
    source: "paystack/webhook",
    message: "paystack.webhook.received",
    context: { reference },
  });

  const supabase = getSupabaseAdmin();
  if (supabase) {
    /**
     * M-5: route via the shared `routePaystackChargeForMonthlyInvoice` so this webhook and every
     * verify route make the **same** monthly-invoice routing decision for the same reference.
     * Behaviour preserved from pre-M-5:
     *   - `monthly_settled` → log + `{ received: true }` ack.
     *   - `monthly_already_processed` → 200 plain-text "Already processed" ack.
     *   - `monthly_error` (rare) AND `not_monthly` → fall through to booking-finalize pipeline.
     */
    const monthlyRouting = await routePaystackChargeForMonthlyInvoice(supabase, {
      reference,
      amountCents: typeof data.amount === "number" ? data.amount : 0,
    });
    if (monthlyRouting.kind === "monthly_settled") {
      const partialCtx =
        monthlyRouting.settled === "partial"
          ? {
              amount_paid_cents: monthlyRouting.amount_paid_cents,
              total_amount_cents: monthlyRouting.total_amount_cents,
            }
          : {};
      await logSystemEvent({
        level: "info",
        source: "paystack/webhook",
        message: "monthly_invoice.charge.success",
        context: {
          reference,
          invoiceId: monthlyRouting.invoiceId,
          settled: monthlyRouting.settled,
          ...partialCtx,
        },
      });
      return NextResponse.json({ received: true });
    }
    if (monthlyRouting.kind === "monthly_already_processed") {
      return new Response("Already processed", {
        status: 200,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }

    const salesDocIdHint = salesDocumentIdFromPaystackMetadata(
      normalizePaystackMetadata(data.metadata) as unknown as Record<string, unknown>,
    );
    const salesRouting = await routePaystackChargeForSalesDocument(supabase, {
      reference,
      amountCents: typeof data.amount === "number" ? data.amount : 0,
      documentIdHint: salesDocIdHint,
    });
    if (salesRouting.kind === "sales_doc_settled") {
      await logSystemEvent({
        level: "info",
        source: "paystack/webhook",
        message: "sales_document.charge.success",
        context: { reference, documentId: salesRouting.documentId },
      });
      return NextResponse.json({ received: true });
    }
    if (salesRouting.kind === "sales_doc_already_processed") {
      return new Response("Already processed", {
        status: 200,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }
    if (salesRouting.kind === "sales_doc_error") {
      await logSystemEvent({
        level: "error",
        source: "paystack/webhook",
        message: "sales_document.charge.error",
        context: { reference, error: salesRouting.error },
      });
      return NextResponse.json({ received: true });
    }
  }

  const amount = typeof data.amount === "number" ? data.amount : 0;
  const currency = typeof data.currency === "string" ? data.currency : "ZAR";

  const customerBlock = data.customer as { email?: string } | undefined;
  const emailFromCustomer = typeof customerBlock?.email === "string" ? customerBlock.email.trim() : "";

  const metadata = normalizePaystackMetadata(data.metadata);
  const { snapshot } = parseBookingSnapshot(metadata, { amountCents: amount });

  const expectedZar = expectedCheckoutZarFromVerify(snapshot, metadata);
  let bookingIdForTrace = resolveInternalBookingIdFromPaystackReference(reference, metadata);
  if (!bookingIdForTrace && supabase) {
    bookingIdForTrace = await bookingIdForPaystackReference(supabase, reference);
    if (bookingIdForTrace) {
      metrics.increment("checkout.paystack_booking_id_db_fallback", {
        bookingId: bookingIdForTrace,
        reference,
      });
    }
  }
  if (expectedZar != null) {
    recordPaystackPricingMismatch({
      expectedZar,
      amountCents: amount,
      bookingId: bookingIdForTrace,
      pricingVersionId: pricingVersionIdFromLocked(snapshot?.locked),
      reference,
    });
  }

  const emailRaw =
    emailFromCustomer ||
    (typeof metadata.customer_email === "string" ? metadata.customer_email : "") ||
    "";
  const email = emailRaw ? normalizeEmail(emailRaw) : "";

  if (!email) {
    await reportOperationalIssue("warn", "paystack/webhook", "No customer email on charge.success", { reference });
  }

  try {
    assertDecoupledPaystackMetadataAllowsFinalize(reference, metadata);
  } catch (e) {
    if (e instanceof PaystackDecoupledMetadataError) {
      await reportOperationalIssue("critical", "paystack/webhook", e.message, {
        reference,
        errorType: "paystack_decoupled_metadata_missing",
      });
      return NextResponse.json({ received: true });
    }
    throw e;
  }

  if (supabase) {
    const persistedHead = await findBookingIdStatusForPaystackReference(supabase, reference);
    if (persistedHead && persistedHead.status !== "pending_payment") {
      await replayPaymentConfirmedNotifyForPersistedBooking({
        supabase,
        bookingId: persistedHead.bookingId,
        paystackReference: reference,
        amountCents: amount,
        metadata:
          data.metadata && typeof data.metadata === "object" && !Array.isArray(data.metadata)
            ? (data.metadata as Record<string, unknown>)
            : undefined,
        snapshot,
        customerEmailHint: email || undefined,
      });
      metrics.increment("checkout.paystack_webhook_skipped_finalize_already_persisted", {
        bookingId: persistedHead.bookingId,
        reference,
      });
      await logSystemEvent({
        level: "info",
        source: "paystack/webhook",
        message: "paystack.webhook.idempotent_skip_finalize",
        context: { reference, bookingId: persistedHead.bookingId, status: persistedHead.status },
      });
      // Backfill Zoho + recurring even when finalize was already done by the verify
      // path — both are idempotent (zoho_invoice_id guard + recurring plan dedup).
      await syncPaidBookingSideEffects(supabase, {
        bookingId: persistedHead.bookingId,
        reference,
        amountCents: amount,
      });
      return NextResponse.json({ received: true });
    }
  }

  const finalizeOp = await finalizePaidBooking({
    source: "webhook",
    paystackReference: reference,
    amountCents: amount,
    currency,
    customerEmail: email,
    snapshot,
    paystackMetadata: metadata,
    paystackAuthorizationCode:
      data.authorization && typeof data.authorization === "object"
        ? String((data.authorization as { authorization_code?: string }).authorization_code ?? "") || null
        : null,
    paystackCustomerCode:
      customerBlock && typeof customerBlock === "object"
        ? String((customerBlock as { customer_code?: string }).customer_code ?? "") || null
        : null,
    paidAtIso: typeof data.paid_at === "string" ? data.paid_at : null,
  });
  const result = upsertResultFromFinalizePaidBookingOp(finalizeOp);

  if (result.error) {
    await reportOperationalIssue("critical", "paystack/webhook", `charge.success: booking upsert failed: ${result.error}`, {
      reference,
    });
  }

  await enqueuePaystackRecoveryFailedJobs({
    reference,
    result,
    basePayload: {
      paystackReference: reference,
      amountCents: amount,
      currency,
      customerEmail: email,
      snapshot,
      paystackMetadata: metadata,
    },
  });

  if (result.bookingId && !result.error) {
    await logSystemEvent({
      level: "info",
      source: "paystack/webhook",
      message: "paystack.booking.created",
      context: { reference, bookingId: result.bookingId, skipped: result.skipped },
    });

    // Idempotent: Zoho invoice + recurring plan provisioning.
    if (supabase) {
      await syncPaidBookingSideEffects(supabase, {
        bookingId: result.bookingId,
        reference,
        amountCents: amount,
      });
    }
  }

  return NextResponse.json({ received: true });
}
