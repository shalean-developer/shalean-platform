import crypto from "crypto";
import { NextResponse } from "next/server";
import { enqueueFailedJob, FAILED_JOBS_ENQUEUE_ERROR } from "@/lib/booking/failedJobs";
import { normalizeEmail } from "@/lib/booking/normalizeEmail";
import { parseBookingSnapshot } from "@/lib/booking/paystackChargeTypes";
import { normalizePaystackMetadata } from "@/lib/booking/paystackMetadata";
import { bookingIdForPaystackReference } from "@/lib/booking/paystackBookingIdLookup";
import { upsertBookingFromPaystack } from "@/lib/booking/upsertBookingFromPaystack";
import { applyMonthlyInvoicePayment } from "@/lib/monthlyInvoice/applyMonthlyInvoicePayment";
import { metrics } from "@/lib/metrics/counters";
import {
  expectedCheckoutZarFromVerify,
  pricingVersionIdFromLocked,
  recordPaystackPricingMismatch,
} from "@/lib/metrics/pricingMismatch";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { notifyBookingEvent } from "@/lib/notifications/notifyBookingEvent";
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
    await reportOperationalIssue("warn", "paystack/webhook", "Invalid or missing Paystack signature");
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let event: { event?: string; data?: Record<string, unknown> };
  try {
    event = JSON.parse(rawBody) as { event?: string; data?: Record<string, unknown> };
  } catch {
    await reportOperationalIssue("warn", "paystack/webhook", "Invalid JSON body");
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
    const invPay = await applyMonthlyInvoicePayment(supabase, {
      reference,
      amountCents: typeof data.amount === "number" ? data.amount : 0,
    });
    if (invPay.ok && "settled" in invPay) {
      const partialCtx =
        invPay.settled === "partial"
          ? {
              amount_paid_cents: invPay.amount_paid_cents,
              total_amount_cents: invPay.total_amount_cents,
            }
          : {};
      await logSystemEvent({
        level: "info",
        source: "paystack/webhook",
        message: "monthly_invoice.charge.success",
        context: {
          reference,
          invoiceId: invPay.invoiceId,
          settled: invPay.settled,
          ...partialCtx,
        },
      });
      return NextResponse.json({ received: true });
    }
    if (
      invPay.ok &&
      "skipped" in invPay &&
      invPay.skipped &&
      (invPay.reason === "already_paid" || invPay.reason === "duplicate_charge")
    ) {
      return new Response("Already processed", { status: 200, headers: { "Content-Type": "text/plain; charset=utf-8" } });
    }

    const { data: existing } = await supabase
      .from("bookings")
      .select("id, status")
      .eq("paystack_reference", reference)
      .maybeSingle();
    if (existing && typeof existing === "object" && "id" in existing) {
      const st = String((existing as { status?: string }).status ?? "");
      if (st !== "pending_payment") {
        return new Response("Already processed", { status: 200, headers: { "Content-Type": "text/plain; charset=utf-8" } });
      }
    }
  }

  const amount = typeof data.amount === "number" ? data.amount : 0;
  const currency = typeof data.currency === "string" ? data.currency : "ZAR";

  const customerBlock = data.customer as { email?: string } | undefined;
  const emailFromCustomer = typeof customerBlock?.email === "string" ? customerBlock.email.trim() : "";

  const metadata = normalizePaystackMetadata(data.metadata);
  const { snapshot } = parseBookingSnapshot(metadata, { amountCents: amount });

  const expectedZar = expectedCheckoutZarFromVerify(snapshot, metadata);
  const bookingIdFromMeta =
    typeof metadata.shalean_booking_id === "string" && metadata.shalean_booking_id.trim()
      ? metadata.shalean_booking_id.trim()
      : null;
  let bookingIdForTrace = bookingIdFromMeta;
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

  let result: Awaited<ReturnType<typeof upsertBookingFromPaystack>>;
  try {
    result = await upsertBookingFromPaystack({
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
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await reportOperationalIssue("critical", "paystack/webhook", `charge.success: upsert threw: ${msg}`, { reference });
    result = { skipped: false, bookingId: null, error: msg };
  }

  if (result.error) {
    await reportOperationalIssue("critical", "paystack/webhook", `charge.success: booking upsert failed: ${result.error}`, {
      reference,
    });
    try {
      await enqueueFailedJob("booking_insert", {
        paystackReference: reference,
        amountCents: amount,
        currency,
        customerEmail: email,
        snapshot,
        paystackMetadata: metadata,
      });
    } catch (e) {
      const cause = e instanceof Error ? e.message : String(e);
      await reportOperationalIssue(
        "critical",
        "paystack/webhook",
        "charge.success: booking upsert failed and failed_jobs enqueue also failed",
        { reference, cause },
      );
      return NextResponse.json(
        { success: false, error: FAILED_JOBS_ENQUEUE_ERROR, reference },
        { status: 500 },
      );
    }
  }

  if (result.bookingId && !result.error) {
    await logSystemEvent({
      level: "info",
      source: "paystack/webhook",
      message: "paystack.booking.created",
      context: { reference, bookingId: result.bookingId, skipped: result.skipped },
    });
  }

  if (!result.skipped && email && result.bookingId && supabase) {
    try {
      await notifyBookingEvent({
        type: "payment_confirmed",
        supabase,
        bookingId: result.bookingId,
        snapshot,
        customerEmail: email,
        amountCents: amount,
        paymentReference: reference,
      });
    } catch (e) {
      await reportOperationalIssue("error", "paystack/webhook/notifyBookingEvent", String(e), {
        reference,
        bookingId: result.bookingId,
      });
    }
  }

  return NextResponse.json({ received: true });
}
