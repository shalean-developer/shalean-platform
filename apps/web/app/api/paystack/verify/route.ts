/**
 * **Responsibility:** Browser / delayed-webhook **fallback finalizer** — calls Paystack verify API then {@link runPaystackVerifyFinalizePipeline} (idempotent vs webhook).
 * See `lib/booking/paystackRouteResponsibilityContract.ts`.
 */
import { NextResponse } from "next/server";
import { normalizeEmail } from "@/lib/booking/normalizeEmail";
import { parseBookingSnapshot } from "@/lib/booking/paystackChargeTypes";
import { normalizePaystackMetadata } from "@/lib/booking/paystackMetadata";
import { resolvePaystackUserId } from "@/lib/booking/resolvePaystackUserId";
import type { PaystackVerifyPostResponse } from "@/lib/booking/paystackVerifyResponse";
import { findBookingIdStatusForPaystackReference, PaystackDecoupledMetadataError } from "@/lib/booking/paystackBookingIdLookup";
import type { BookingSnapshotV1 } from "@/lib/booking/paystackChargeTypes";
import type { UpsertBookingFromPaystackResult } from "@/lib/booking/upsertBookingFromPaystack";
import {
  runPaystackVerifyFinalizePipeline,
  type PaystackChargeVerifyTx,
} from "@/lib/booking/runPaystackVerifyFinalizePipeline";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { logSystemEvent, reportOperationalIssue } from "@/lib/logging/systemLog";
import { allowPaystackVerifyRequest, paystackVerifyRateLimitKey } from "@/lib/rateLimit/paystackVerifyIpLimit";
import { replayPaymentConfirmedNotifyForPersistedBooking } from "@/lib/booking/paystackReplayPaymentConfirmedNotify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export type { PaystackVerifyPostResponse } from "@/lib/booking/paystackVerifyResponse";

function paystackChargeUpsertState(r: UpsertBookingFromPaystackResult): string {
  if (r.reason === "amount_mismatch") return "payment_mismatch";
  if (r.reason === "finalization_failed") return "payment_reconciliation_required";
  if (r.error && !r.bookingId) return "payment_reconciliation_required";
  return "paid";
}

type PaystackVerifyJson = {
  status?: boolean;
  message?: string;
  data?: PaystackChargeVerifyTx;
};

async function fetchPaystackVerify(reference: string, secret: string): Promise<PaystackVerifyJson> {
  const res = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: { Authorization: `Bearer ${secret}` },
  });
  return (await res.json()) as PaystackVerifyJson;
}

/**
 * Query: ?reference=... or ?trxref=...
 * On Paystack `success`, runs the same finalization path as POST (localhost / no-webhook fallback).
 */
export async function GET(request: Request) {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) {
    return NextResponse.json({ error: "Paystack is not configured." }, { status: 503 });
  }

  if (!allowPaystackVerifyRequest(paystackVerifyRateLimitKey(request))) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const { searchParams } = new URL(request.url);
  const reference = searchParams.get("reference") ?? searchParams.get("trxref");
  if (!reference) {
    return NextResponse.json({ error: "Missing reference." }, { status: 400 });
  }

  await logSystemEvent({
    level: "info",
    source: "paystack/verify",
    message: "Verify GET",
    context: { reference },
  });

  const json = await fetchPaystackVerify(reference, secret);

  if (!json.status || !json.data) {
    await reportOperationalIssue("warn", "paystack/verify", "paystack.verify.remote_failed", {
      reference,
      errorType: "paystack_verify_remote_failed",
      paystack_message: String(json.message ?? "").slice(0, 500) || null,
    });
    return NextResponse.json(
      { ok: false, error: json.message || "Verification failed." },
      { status: 400 },
    );
  }

  const tx = json.data;
  if (tx.status !== "success") {
    return NextResponse.json({
      ok: false,
      success: false,
      status: tx.status,
      reference: tx.reference ?? reference,
      amount: tx.amount,
      currency: tx.currency,
      customerEmail: tx.customer?.email,
      paidAt: tx.paid_at,
      metadata: tx.metadata,
      bookingId: null,
      bookingInDatabase: false,
      state: tx.status === "failed" ? "failed" : "pending",
    });
  }

  const ref = tx.reference ?? reference;
  const adminGet = getSupabaseAdmin();
  if (adminGet) {
    const existing = await findBookingIdStatusForPaystackReference(adminGet, ref);
    if (existing && existing.status !== "pending_payment") {
      const amountCentsGet =
        typeof tx.amount === "number" && Number.isFinite(tx.amount) ? tx.amount : 0;
      const emailFromCustomer = typeof tx.customer?.email === "string" ? tx.customer.email.trim() : "";
      await replayPaymentConfirmedNotifyForPersistedBooking({
        supabase: adminGet,
        bookingId: existing.bookingId,
        paystackReference: ref,
        amountCents: amountCentsGet,
        metadata: tx.metadata,
        customerEmailHint: emailFromCustomer || undefined,
      });
      return NextResponse.json({
        ok: true,
        success: true,
        status: tx.status,
        reference: ref,
        amount: tx.amount,
        currency: tx.currency,
        customerEmail: tx.customer?.email,
        paidAt: tx.paid_at,
        metadata: tx.metadata,
        bookingId: existing.bookingId,
        bookingInDatabase: true,
        state: "already_processed",
        upsertError: null,
        skipped: true,
      });
    }
  }

  try {
    const pipeline = await runPaystackVerifyFinalizePipeline(tx, reference, "paystack/verify");
    const { result } = pipeline;
    const bookingInDatabase = result.bookingInDatabase ?? Boolean(result.bookingId);
    const chargeState = paystackChargeUpsertState(result);

    return NextResponse.json({
      ok: true,
      success: true,
      status: tx.status,
      reference: pipeline.ref,
      amount: pipeline.amount,
      currency: pipeline.currency,
      customerEmail: tx.customer?.email,
      paidAt: tx.paid_at,
      metadata: tx.metadata,
      bookingId: result.bookingId,
      bookingInDatabase,
      state: chargeState,
      upsertError: result.error ?? null,
      skipped: Boolean(result.skipped),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!(err instanceof PaystackDecoupledMetadataError)) {
      await reportOperationalIssue("error", "paystack/verify", "paystack.verify.finalize_pipeline_failed", {
        reference: tx.reference ?? reference,
        errorType: "paystack_verify_finalize_failed",
        message: msg.slice(0, 500),
      });
    }
    if (err instanceof PaystackDecoupledMetadataError) {
      return NextResponse.json(
        {
          ok: false,
          success: false,
          error: err.message,
          reference: tx.reference ?? reference,
        },
        { status: 400 },
      );
    }
    return NextResponse.json({
      ok: true,
      success: true,
      status: tx.status,
      reference: tx.reference ?? reference,
      amount: tx.amount,
      currency: tx.currency,
      customerEmail: tx.customer?.email,
      paidAt: tx.paid_at,
      metadata: tx.metadata,
      bookingId: null,
      bookingInDatabase: false,
      state: "finalization_failed",
      upsertError: err instanceof Error ? err.message : String(err),
      skipped: false,
    });
  }
}

/**
 * POST body: `{ "reference": string }` only. Do not trust any other client fields.
 *
 * 1. GET https://api.paystack.co/transaction/verify/:reference (Authorization: Bearer SECRET)
 * 2. If charge successful — email, amount, metadata come **only** from that response
 * 3. `booking_json` in metadata was set server-side at initialize; parsed snapshot drives Supabase insert
 * 4. Supabase uses `SUPABASE_SERVICE_ROLE_KEY` via `getSupabaseAdmin()`
 * 5. If a row with `paystack_reference` already exists → success, no duplicate insert / email
 * 6. Otherwise insert; send Resend emails on new insert, or if insert fails but payment succeeded (failsafe)
 */
export async function POST(request: Request): Promise<NextResponse<PaystackVerifyPostResponse>> {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) {
    return NextResponse.json(
      { success: false, ok: false, paymentStatus: "unknown", error: "Paystack is not configured." },
      { status: 503 },
    );
  }

  if (!allowPaystackVerifyRequest(paystackVerifyRateLimitKey(request))) {
    return NextResponse.json(
      { success: false, ok: false, paymentStatus: "unknown", error: "Too many requests." },
      { status: 429 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, ok: false, paymentStatus: "unknown", error: "Invalid JSON body." },
      { status: 400 },
    );
  }

  const reference =
    body &&
    typeof body === "object" &&
    typeof (body as { reference?: unknown }).reference === "string"
      ? (body as { reference: string }).reference.trim()
      : "";

  if (!reference) {
    return NextResponse.json(
      { success: false, ok: false, paymentStatus: "unknown", error: "Missing reference." },
      { status: 400 },
    );
  }

  await logSystemEvent({
    level: "info",
    source: "paystack/verify",
    message: "Verify POST",
    context: { reference },
  });

  const json = await fetchPaystackVerify(reference, secret);

  if (!json.status || !json.data) {
    await reportOperationalIssue("warn", "paystack/verify", "paystack.verify.remote_failed", {
      reference,
      errorType: "paystack_verify_remote_failed",
      paystack_message: String(json.message ?? "").slice(0, 500) || null,
    });
    return NextResponse.json(
      {
        success: false,
        ok: false,
        paymentStatus: "unknown",
        reference,
        error: json.message || "Verification failed.",
      },
      { status: 400 },
    );
  }

  const tx = json.data;
  const payStatus = tx.status ?? "unknown";
  const ref = tx.reference ?? reference;

  if (payStatus === "failed") {
    return NextResponse.json({
      success: false,
      ok: false,
      paymentStatus: "failed",
      reference: ref,
      error: "Payment was not successful.",
    });
  }

  if (payStatus !== "success") {
    return NextResponse.json({
      success: false,
      ok: false,
      paymentStatus: "pending",
      reference: ref,
      error: "Payment is still processing.",
    });
  }

  const txAmount = typeof tx.amount === "number" && Number.isFinite(tx.amount) ? tx.amount : 0;
  const txCurrency = typeof tx.currency === "string" ? tx.currency.toUpperCase() : "ZAR";
  const adminPost = getSupabaseAdmin();
  if (adminPost) {
    const existingPost = await findBookingIdStatusForPaystackReference(adminPost, ref);
    if (existingPost && existingPost.status !== "pending_payment") {
      const metadataShort = normalizePaystackMetadata(tx.metadata);
      const { snapshot: snapShort } = parseBookingSnapshot(metadataShort, { amountCents: txAmount });
      const emailFromCustomer = typeof tx.customer?.email === "string" ? tx.customer.email.trim() : "";
      const emailRaw =
        emailFromCustomer ||
        (typeof metadataShort.customer_email === "string" ? metadataShort.customer_email : "") ||
        "";
      const emailNorm = emailRaw ? normalizeEmail(emailRaw) : "";
      const userIdShort = resolvePaystackUserId(snapShort, metadataShort);
      const emailFromCustomerPost = typeof tx.customer?.email === "string" ? tx.customer.email.trim() : "";
      await replayPaymentConfirmedNotifyForPersistedBooking({
        supabase: adminPost,
        bookingId: existingPost.bookingId,
        paystackReference: ref,
        amountCents: txAmount,
        metadata: tx.metadata,
        snapshot: snapShort,
        customerEmailHint: emailNorm || emailFromCustomerPost || undefined,
      });
      return NextResponse.json({
        success: true,
        ok: true,
        paymentStatus: "success",
        reference: ref,
        amountCents: txAmount,
        currency: txCurrency,
        customerEmail: emailNorm,
        customerName: snapShort?.customer?.name?.trim() ?? null,
        userId: userIdShort,
        bookingSnapshot: snapShort ?? null,
        bookingInDatabase: true,
        bookingId: existingPost.bookingId,
        state: "already_processed",
        alreadyExists: true,
        skipped: true,
        upsertError: null,
        assignmentType: null,
        fallbackReason: null,
        showCleanerSubstitutionNotice: false,
        attemptedCleanerId: null,
        assignedCleanerId: null,
        selectedCleanerId: null,
      });
    }
  }

  let pipeline: Awaited<ReturnType<typeof runPaystackVerifyFinalizePipeline>>;
  try {
    pipeline = await runPaystackVerifyFinalizePipeline(tx, reference, "paystack/verify");
  } catch (err) {
    if (err instanceof PaystackDecoupledMetadataError) {
      await reportOperationalIssue("error", "paystack/verify", err.message, { reference: ref });
      return NextResponse.json(
        {
          success: false,
          ok: false,
          paymentStatus: "unknown",
          reference: ref,
          error: err.message,
        },
        { status: 400 },
      );
    }
    throw err;
  }

  const {
    result,
    metadata,
    snapshot,
    email,
    amount,
    currency,
    assignmentType,
    fallbackReason,
    attemptedCleanerId,
    assignedCleanerId,
    selectedCleanerId,
  } = pipeline;

  const showCleanerSubstitutionNotice = assignmentType === "auto_fallback";

  const bookingInDatabase = result.bookingInDatabase ?? Boolean(result.bookingId);
  const chargeState = paystackChargeUpsertState(result);
  const alreadyExists = Boolean(result.skipped && result.bookingId);

  const userId = resolvePaystackUserId(snapshot, metadata);

  if (!result.bookingId) {
    return NextResponse.json({
      success: true,
      ok: true,
      paymentStatus: "success",
      reference: ref,
      amountCents: amount,
      currency,
      customerEmail: email,
      customerName: snapshot?.customer?.name?.trim() ?? null,
      userId,
      bookingSnapshot: snapshot ?? null,
      bookingInDatabase: false,
      bookingId: null,
      state: chargeState,
      alreadyExists: false,
      skipped: Boolean(result.skipped),
      upsertError: result.error ?? "Could not save booking.",
      assignmentType: null,
      fallbackReason: null,
      showCleanerSubstitutionNotice: false,
      attemptedCleanerId: null,
      assignedCleanerId: null,
      selectedCleanerId: null,
    });
  }

  return NextResponse.json({
    success: true,
    ok: true,
    paymentStatus: "success",
    reference: ref,
    amountCents: amount,
    currency,
    customerEmail: email,
    customerName: snapshot?.customer?.name?.trim() ?? null,
    userId,
    bookingSnapshot: snapshot ?? null,
    bookingInDatabase,
    bookingId: result.bookingId,
    state: chargeState,
    alreadyExists,
    skipped: Boolean(result.skipped),
    upsertError: result.error ?? null,
    assignmentType,
    fallbackReason,
    showCleanerSubstitutionNotice,
    attemptedCleanerId,
    assignedCleanerId,
    selectedCleanerId,
  });
}
