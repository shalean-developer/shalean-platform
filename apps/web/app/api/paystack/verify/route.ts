import { NextResponse } from "next/server";
import { enqueuePaystackRecoveryFailedJobs } from "@/lib/booking/enqueuePaystackRecoveryFailedJobs";
import { normalizeEmail } from "@/lib/booking/normalizeEmail";
import { parseBookingSnapshot } from "@/lib/booking/paystackChargeTypes";
import { normalizePaystackMetadata } from "@/lib/booking/paystackMetadata";
import { resolvePaystackUserId } from "@/lib/booking/resolvePaystackUserId";
import type { PaystackVerifyPostResponse } from "@/lib/booking/paystackVerifyResponse";
import {
  bookingIdForPaystackReference,
  findBookingIdStatusForPaystackReference,
  PaystackDecoupledMetadataError,
  resolveInternalBookingIdFromPaystackReference,
  assertDecoupledPaystackMetadataAllowsFinalize,
} from "@/lib/booking/paystackBookingIdLookup";
import { finalizePaystackChargeSuccess } from "@/lib/booking/finalizePaystackChargeSuccess";
import type { BookingSnapshotV1 } from "@/lib/booking/paystackChargeTypes";
import type { UpsertBookingFromPaystackResult } from "@/lib/booking/upsertBookingFromPaystack";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { metrics } from "@/lib/metrics/counters";
import {
  expectedCheckoutZarFromVerify,
  pricingVersionIdFromLocked,
  recordPaystackPricingMismatch,
} from "@/lib/metrics/pricingMismatch";
import { sendCustomerBookingPaymentProcessingEmail } from "@/lib/email/sendBookingEmail";
import { logSystemEvent, reportOperationalIssue } from "@/lib/logging/systemLog";
import { allowPaystackVerifyRequest, paystackVerifyRateLimitKey } from "@/lib/rateLimit/paystackVerifyIpLimit";
import type { SupabaseClient } from "@supabase/supabase-js";
import { notifyBookingEvent } from "@/lib/notifications/notifyBookingEvent";
import { notifyBookingDebug } from "@/lib/notifications/notifyBookingDebug";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export type { PaystackVerifyPostResponse } from "@/lib/booking/paystackVerifyResponse";

function paystackChargeUpsertState(r: UpsertBookingFromPaystackResult): string {
  if (r.reason === "amount_mismatch") return "payment_mismatch";
  if (r.reason === "finalization_failed") return "payment_reconciliation_required";
  if (r.error && !r.bookingId) return "payment_reconciliation_required";
  return "paid";
}

/** Replay-safe: idempotency inside {@link notifyBookingEvent} prevents duplicate sends. */
async function notifyPaymentConfirmedForAlreadyFinalizedBooking(params: {
  supabase: SupabaseClient;
  tx: PaystackVerifyData;
  ref: string;
  bookingId: string;
  amountCents: number;
  snapshot?: BookingSnapshotV1 | null;
  customerEmail?: string;
}): Promise<void> {
  const metadata = normalizePaystackMetadata(params.tx.metadata);
  const snapshot =
    params.snapshot !== undefined
      ? params.snapshot
      : parseBookingSnapshot(metadata, { amountCents: params.amountCents }).snapshot;
  let customerEmail = (params.customerEmail ?? "").trim();
  if (!customerEmail) {
    const emailFromCustomer = typeof params.tx.customer?.email === "string" ? params.tx.customer.email.trim() : "";
    const emailRaw =
      emailFromCustomer ||
      (typeof metadata.customer_email === "string" ? metadata.customer_email : "") ||
      "";
    customerEmail = emailRaw ? normalizeEmail(emailRaw) : "";
  }
  notifyBookingDebug("paystack_verify_early_return_notify", {
    bookingId: params.bookingId,
    reference: params.ref,
  });
  try {
    await notifyBookingEvent({
      type: "payment_confirmed",
      supabase: params.supabase,
      bookingId: params.bookingId,
      snapshot,
      customerEmail,
      amountCents: params.amountCents,
      paymentReference: params.ref,
    });
  } catch (err) {
    notifyBookingDebug("paystack_verify_early_return_notify_throw", {
      bookingId: params.bookingId,
      message: err instanceof Error ? err.message : String(err),
    });
    await reportOperationalIssue("error", "paystack/verify/early_return_notify", String(err), {
      bookingId: params.bookingId,
      reference: params.ref,
    });
  }
}

type PaystackVerifyData = {
  status?: string;
  reference?: string;
  amount?: number;
  currency?: string;
  paid_at?: string;
  customer?: { email?: string; customer_code?: string };
  authorization?: { authorization_code?: string };
  metadata?: Record<string, unknown>;
};

type PaystackVerifyJson = {
  status?: boolean;
  message?: string;
  data?: PaystackVerifyData;
};

async function fetchPaystackVerify(reference: string, secret: string): Promise<PaystackVerifyJson> {
  const res = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: { Authorization: `Bearer ${secret}` },
  });
  return (await res.json()) as PaystackVerifyJson;
}

type PaystackVerifySuccessPipelineResult = {
  result: Awaited<ReturnType<typeof finalizePaystackChargeSuccess>>;
  metadata: Record<string, string | undefined>;
  snapshot: BookingSnapshotV1 | null;
  email: string;
  ref: string;
  amount: number;
  currency: string;
  assignmentType: string | null;
  fallbackReason: string | null;
  attemptedCleanerId: string | null;
  assignedCleanerId: string | null;
  selectedCleanerId: string | null;
};

/**
 * Paystack `success` only: normalize metadata, parse snapshot, call {@link finalizePaystackChargeSuccess}
 * (which runs `upsertBookingFromPaystack`), enqueue recovery, send processing email if needed.
 */
async function runPaystackVerifySuccessPipeline(
  tx: PaystackVerifyData,
  referenceInput: string,
): Promise<PaystackVerifySuccessPipelineResult> {
  const amount = typeof tx.amount === "number" ? tx.amount : 0;
  const currency = typeof tx.currency === "string" ? tx.currency : "ZAR";
  const authorizationCode =
    tx && typeof tx === "object" && tx.authorization && typeof tx.authorization === "object"
      ? String((tx.authorization as { authorization_code?: string }).authorization_code ?? "")
      : "";
  const customerCode =
    tx && typeof tx === "object" && tx.customer && typeof tx.customer === "object"
      ? String((tx.customer as { customer_code?: string }).customer_code ?? "")
      : "";
  const metadata = normalizePaystackMetadata(tx.metadata);
  notifyBookingDebug("paystack_verify_metadata", {
    reference: tx.reference ?? referenceInput,
    metadataKeys: Object.keys(metadata ?? {}),
  });
  const { snapshot } = parseBookingSnapshot(metadata, { amountCents: amount });

  const ref = tx.reference ?? referenceInput;
  assertDecoupledPaystackMetadataAllowsFinalize(ref, metadata);

  const expectedZar = expectedCheckoutZarFromVerify(snapshot, metadata);
  let bookingIdForTrace = resolveInternalBookingIdFromPaystackReference(ref, metadata);
  if (!bookingIdForTrace) {
    const admin = getSupabaseAdmin();
    if (admin) {
      bookingIdForTrace = await bookingIdForPaystackReference(admin, ref);
      if (bookingIdForTrace) {
        metrics.increment("checkout.paystack_booking_id_db_fallback", {
          bookingId: bookingIdForTrace,
          reference: ref,
        });
      }
    }
  }
  if (expectedZar != null) {
    recordPaystackPricingMismatch({
      expectedZar,
      amountCents: amount,
      bookingId: bookingIdForTrace,
      pricingVersionId: pricingVersionIdFromLocked(snapshot?.locked),
      reference: ref,
    });
  }

  const emailFromCustomer = typeof tx.customer?.email === "string" ? tx.customer.email.trim() : "";
  const emailRaw =
    emailFromCustomer ||
    (typeof metadata.customer_email === "string" ? metadata.customer_email : "") ||
    "";
  const email = emailRaw ? normalizeEmail(emailRaw) : "";

  if (process.env.NODE_ENV !== "production" || process.env.TRACE_PAYSTACK_METADATA === "1") {
    console.log("[VERIFY → UPSERT TRIGGERED]", { reference: ref, metadata: tx.metadata });
  }

  const result = await finalizePaystackChargeSuccess({
    source: "verify",
    paystackReference: ref,
    amountCents: amount,
    currency,
    customerEmail: email,
    snapshot,
    paystackMetadata: metadata,
    paystackAuthorizationCode: authorizationCode || null,
    paystackCustomerCode: customerCode || null,
    paidAtIso: typeof tx.paid_at === "string" ? tx.paid_at : null,
  });

  const adm = getSupabaseAdmin();
  let assignmentType: string | null = null;
  let fallbackReason: string | null = null;
  let attemptedCleanerId: string | null = null;
  let assignedCleanerId: string | null = null;
  let selectedCleanerId: string | null = null;
  if (result.bookingId && adm) {
    const { data: ar } = await adm
      .from("bookings")
      .select("assignment_type, fallback_reason, cleaner_id, selected_cleaner_id, attempted_cleaner_id")
      .eq("id", result.bookingId)
      .maybeSingle();
    if (ar && typeof ar === "object") {
      assignmentType = String((ar as { assignment_type?: string | null }).assignment_type ?? "").trim() || null;
      fallbackReason = String((ar as { fallback_reason?: string | null }).fallback_reason ?? "").trim() || null;
      attemptedCleanerId =
        String((ar as { attempted_cleaner_id?: string | null }).attempted_cleaner_id ?? "").trim() || null;
      assignedCleanerId = String((ar as { cleaner_id?: string | null }).cleaner_id ?? "").trim() || null;
      selectedCleanerId = String((ar as { selected_cleaner_id?: string | null }).selected_cleaner_id ?? "").trim() || null;
    }
  }

  if (result.error) {
    await reportOperationalIssue("critical", "paystack/verify", `payment verified success but booking upsert failed: ${result.error}`, {
      reference: ref,
    });
  }

  if (result.bookingId && !result.error) {
    await logSystemEvent({
      level: "info",
      source: "paystack/verify",
      message: "paystack.booking.created",
      context: { reference: ref, bookingId: result.bookingId, skipped: result.skipped },
    });
  }

  await enqueuePaystackRecoveryFailedJobs({
    reference: ref,
    result,
    basePayload: {
      paystackReference: ref,
      amountCents: amount,
      currency,
      customerEmail: email,
      snapshot,
      paystackMetadata: metadata,
    },
  });

  if (email && !result.bookingId) {
    const cust = await sendCustomerBookingPaymentProcessingEmail({
      customerEmail: email,
      paymentReference: ref,
    });
    if (!cust.sent && cust.error) {
      await reportOperationalIssue("error", "paystack/verify", `processing ack email not sent: ${cust.error}`, {
        reference: ref,
      });
    }
  }

  return {
    result,
    metadata,
    snapshot,
    email,
    ref,
    amount,
    currency,
    assignmentType,
    fallbackReason,
    attemptedCleanerId,
    assignedCleanerId,
    selectedCleanerId,
  };
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
      await notifyPaymentConfirmedForAlreadyFinalizedBooking({
        supabase: adminGet,
        tx,
        ref,
        bookingId: existing.bookingId,
        amountCents: amountCentsGet,
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
    const pipeline = await runPaystackVerifySuccessPipeline(tx, reference);
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
    console.error("[VERIFY GET FINALIZE FAILED]", err);
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
      await notifyPaymentConfirmedForAlreadyFinalizedBooking({
        supabase: adminPost,
        tx,
        ref,
        bookingId: existingPost.bookingId,
        amountCents: txAmount,
        snapshot: snapShort,
        customerEmail: emailNorm,
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

  let pipeline: Awaited<ReturnType<typeof runPaystackVerifySuccessPipeline>>;
  try {
    pipeline = await runPaystackVerifySuccessPipeline(tx, reference);
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
