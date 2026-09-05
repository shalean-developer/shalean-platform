import { provePersistedPaystackReplay } from "@/lib/booking/provePersistedPaystackReplay";
/**
 * **Responsibility:** Browser / delayed-webhook **fallback finalizer** — calls Paystack verify API then {@link runPaystackVerifyFinalizePipeline} (idempotent vs webhook).
 * See `lib/booking/paystackRouteResponsibilityContract.ts`.
 *
 * **M-5 (May 2026)**: every successful Paystack verification first runs through
 * {@link routePaystackChargeForMonthlyInvoice}. Monthly-invoice references settle via
 * `applyMonthlyInvoicePayment` (H-1 allocation path) and short-circuit; only non-monthly
 * references continue into `runPaystackVerifyFinalizePipeline` →
 * `upsertBookingFromPaystack`. The webhook uses the same routing helper, so the two paths
 * are guaranteed to converge on which engine processes a given reference.
 */
import { NextResponse } from "next/server";
import { normalizeEmail } from "@/lib/booking/normalizeEmail";
import { parseBookingSnapshot } from "@/lib/booking/paystackChargeTypes";
import { normalizePaystackMetadata } from "@/lib/booking/paystackMetadata";
import { resolvePaystackUserId } from "@/lib/booking/resolvePaystackUserId";
import type { PaystackVerifyPostResponse } from "@/lib/booking/paystackVerifyResponse";
import { findBookingIdStatusForPaystackReference, PaystackDecoupledMetadataError } from "@/lib/booking/paystackBookingIdLookup";
import type { UpsertBookingFromPaystackResult } from "@/lib/booking/upsertBookingFromPaystack";
import {
  runPaystackVerifyFinalizePipeline,
  type PaystackChargeVerifyTx,
} from "@/lib/booking/runPaystackVerifyFinalizePipeline";
import {
  routePaystackChargeForMonthlyInvoice,
  shouldShortCircuitForMonthlyInvoice,
  type PaystackChargeMonthlyRouting,
} from "@/lib/booking/routePaystackChargeForMonthlyInvoice";
import {
  routePaystackChargeForSalesDocument,
  shouldShortCircuitForSalesDocument,
} from "@/lib/salesDocument/routePaystackChargeForSalesDocument";
import {
  isSalesDocumentPaystackReference,
  salesDocumentIdFromPaystackMetadata,
} from "@/lib/salesDocument/salesDocumentPaystackReference";
import { monthlyInvoiceIdFromPaystackMetadata } from "@/lib/monthlyInvoice/monthlyInvoicePaystackReference";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { logSystemEvent, reportOperationalIssue } from "@/lib/logging/systemLog";
import { allowPaystackVerifyRequest, paystackVerifyRateLimitKey } from "@/lib/rateLimit/paystackVerifyIpLimit";
import { replayPaymentConfirmedNotifyForPersistedBooking } from "@/lib/booking/paystackReplayPaymentConfirmedNotify";
import { loadBookingReferenceForId } from "@/lib/booking/loadBookingReference";
import {
  paystackChargeDataFromRecord,
  recordPaystackBookingPayment,
  recordPaystackMonthlyInvoicePayment,
  recordPaystackSalesDocumentPayment,
} from "@/lib/payments/recordPaystackSettlement";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export type { PaystackVerifyPostResponse } from "@/lib/booking/paystackVerifyResponse";

function paystackChargeUpsertState(r: UpsertBookingFromPaystackResult): string {
  if (r.reason === "amount_mismatch") return "payment_mismatch";
  if (r.reason === "finalization_failed") return "payment_reconciliation_required";
  if (r.error || r.ok === false) return "payment_reconciliation_required";
  return "paid";
}

/** Gateway success does not imply that booking finalization was accepted. */
function rejectedBookingFinalization(result: UpsertBookingFromPaystackResult, reference: string) {
  const error = result.error || "PAYMENT_FINALIZATION_FAILED";
  return NextResponse.json({
    ok: false as const,
    success: false as const,
    paymentStatus: "success" as const,
    reference,
    error,
    upsertError: error,
    code: result.code,
    reason: result.reason,
    bookingId: result.bookingId,
    bookingInDatabase: result.bookingInDatabase ?? Boolean(result.bookingId),
    state: paystackChargeUpsertState(result),
    alreadyExists: false,
    skipped: Boolean(result.skipped),
  }, { status: 409 });
}

/**
 * Maps an M-5 monthly-invoice routing decision to the verify-route `state` string. Keeps the
 * existing GET / POST `state` field a `string` (no schema change) while making the source of
 * the short-circuit explicit for the success page.
 */
function monthlyInvoiceVerifyState(routing: PaystackChargeMonthlyRouting): string {
  if (routing.kind === "monthly_settled") {
    return routing.settled === "full" ? "monthly_invoice_settled" : "monthly_invoice_partial";
  }
  if (routing.kind === "monthly_already_processed") {
    if (routing.reason === "amount_mismatch_quarantined") {
      return "monthly_invoice_amount_mismatch_quarantined";
    }
    return "monthly_invoice_already_processed";
  }
  return "paid";
}

type PaystackVerifyJson = {
  status?: boolean;
  message?: string;
  data?: PaystackChargeVerifyTx;
};

async function fetchPaystackVerify(reference: string, secret: string): Promise<PaystackVerifyJson> {
  try {
    const res = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
      headers: { Authorization: `Bearer ${secret}` },
      // Bound remote verify so /account/success does not sit on "Still confirming…" forever.
      signal: AbortSignal.timeout(12_000),
    });
    return (await res.json()) as PaystackVerifyJson;
  } catch (err) {
    const aborted =
      (err instanceof DOMException && err.name === "AbortError") ||
      (err instanceof Error && err.name === "AbortError");
    return {
      status: false,
      message: aborted ? "Paystack verify timed out." : err instanceof Error ? err.message : "Paystack verify failed.",
    };
  }
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
  /**
   * M-5: route the charge to `applyMonthlyInvoicePayment` first whenever the reference matches
   * a monthly invoice row. Falls through to the booking pipeline only on `not_monthly` (and on
   * `monthly_error`, mirroring the pre-M-5 webhook fall-through so unknown / errored references
   * preserve existing booking-flow error semantics).
   */
  if (adminGet) {
    const monthlyAmountGet = typeof tx.amount === "number" && Number.isFinite(tx.amount) ? tx.amount : 0;
    const monthlyInvoiceIdHintGet = monthlyInvoiceIdFromPaystackMetadata(
      tx.metadata as Record<string, unknown> | undefined,
    );
    const monthlyRoutingGet = await routePaystackChargeForMonthlyInvoice(adminGet, {
      reference: ref,
      amountCents: monthlyAmountGet,
      invoiceIdHint: monthlyInvoiceIdHintGet,
    });
    if (shouldShortCircuitForMonthlyInvoice(monthlyRoutingGet)) {
      await logSystemEvent({
        level: "info",
        source: "paystack/verify",
        message: "monthly_invoice.charge.success",
        context: {
          reference: ref,
          routing_kind: monthlyRoutingGet.kind,
          ...(monthlyRoutingGet.kind === "monthly_settled"
            ? { invoiceId: monthlyRoutingGet.invoiceId, settled: monthlyRoutingGet.settled }
            : { reason: monthlyRoutingGet.reason }),
        },
      });
      if (monthlyRoutingGet.kind === "monthly_settled" || monthlyRoutingGet.kind === "monthly_already_processed") {
        const skipLedger =
          monthlyRoutingGet.kind === "monthly_already_processed" &&
          monthlyRoutingGet.reason === "amount_mismatch_quarantined";
        const invoiceId =
          monthlyRoutingGet.kind === "monthly_settled"
            ? monthlyRoutingGet.invoiceId
            : monthlyInvoiceIdHintGet;
        if (invoiceId && !skipLedger) {
          await recordPaystackMonthlyInvoicePayment(adminGet, {
            reference: ref,
            amountCents: monthlyAmountGet,
            invoiceId,
            paidAtIso: typeof tx.paid_at === "string" ? tx.paid_at : null,
            chargeData: paystackChargeDataFromRecord(tx as Record<string, unknown>),
          });
        }
      }
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
        bookingId: null,
        bookingInDatabase: false,
        state: monthlyInvoiceVerifyState(monthlyRoutingGet),
        upsertError: null,
        skipped: monthlyRoutingGet.kind === "monthly_already_processed",
        monthlyInvoiceId:
          monthlyRoutingGet.kind === "monthly_settled" ? monthlyRoutingGet.invoiceId : null,
      });
    }

    const salesDocIdHintGet = salesDocumentIdFromPaystackMetadata(
      tx.metadata as Record<string, unknown> | undefined,
    );
    const salesRoutingGet = await routePaystackChargeForSalesDocument(adminGet, {
      reference: ref,
      amountCents: monthlyAmountGet,
      documentIdHint: salesDocIdHintGet,
    });
    if (shouldShortCircuitForSalesDocument(salesRoutingGet)) {
      await logSystemEvent({
        level: "info",
        source: "paystack/verify",
        message: "sales_document.charge.success",
        context: {
          reference: ref,
          routing_kind: salesRoutingGet.kind,
          ...(salesRoutingGet.kind === "sales_doc_settled"
            ? { documentId: salesRoutingGet.documentId }
            : { reason: salesRoutingGet.reason }),
        },
      });
      if (salesRoutingGet.kind === "sales_doc_settled" || salesRoutingGet.kind === "sales_doc_already_processed") {
        const documentId =
          salesRoutingGet.kind === "sales_doc_settled"
            ? salesRoutingGet.documentId
            : salesDocIdHintGet;
        if (documentId) {
          await recordPaystackSalesDocumentPayment(adminGet, {
            reference: ref,
            amountCents: monthlyAmountGet,
            documentId,
            paidAtIso: typeof tx.paid_at === "string" ? tx.paid_at : null,
            chargeData: paystackChargeDataFromRecord(tx as Record<string, unknown>),
          });
        }
      }
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
        bookingId: null,
        bookingInDatabase: false,
        state: salesRoutingGet.kind === "sales_doc_settled" ? "paid" : "already_processed",
        upsertError: null,
        skipped: salesRoutingGet.kind === "sales_doc_already_processed",
        salesDocumentId:
          salesRoutingGet.kind === "sales_doc_settled" ? salesRoutingGet.documentId : null,
      });
    }
    if (salesRoutingGet.kind === "sales_doc_error") {
      return NextResponse.json(
        {
          ok: false,
          success: false,
          paymentStatus: "unknown",
          error: salesRoutingGet.error,
          reference: ref,
        },
        { status: 409 },
      );
    }
    if (isSalesDocumentPaystackReference(ref)) {
      return NextResponse.json(
        {
          ok: false,
          success: false,
          paymentStatus: "unknown",
          error: "sales_document_payment_not_applied",
          reference: ref,
        },
        { status: 409 },
      );
    }
  }
  if (adminGet) {
    const existing = await findBookingIdStatusForPaystackReference(adminGet, ref);
    if (existing && existing.status !== "pending_payment") {
      const amountCentsGet =
        typeof tx.amount === "number" && Number.isFinite(tx.amount) ? tx.amount : 0;
      const emailFromCustomer = typeof tx.customer?.email === "string" ? tx.customer.email.trim() : "";
      if (!await provePersistedPaystackReplay({
        supabase: adminGet, bookingId: existing.bookingId, reference: ref,
        amountCents: amountCentsGet, customerEmail: typeof tx.customer?.email === "string" ? tx.customer.email : "",
        metadata: tx.metadata,
      })) {
        return NextResponse.json({ ok: false, success: false, paymentStatus: "unknown",
          reference: ref, error: "PAYMENT_FINALIZATION_REPLAY_MISMATCH" }, { status: 409 });
      }
      await replayPaymentConfirmedNotifyForPersistedBooking({
        supabase: adminGet,
        bookingId: existing.bookingId,
        paystackReference: ref,
        amountCents: amountCentsGet,
        metadata: tx.metadata,
        customerEmailHint: emailFromCustomer || undefined,
      });
      await recordPaystackBookingPayment(adminGet, {
        reference: ref,
        amountCents: amountCentsGet,
        bookingId: existing.bookingId,
        currency: typeof tx.currency === "string" ? tx.currency : "ZAR",
        paidAtIso: typeof tx.paid_at === "string" ? tx.paid_at : null,
        chargeData: paystackChargeDataFromRecord(tx as Record<string, unknown>),
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
    if (result.error || result.ok === false) return rejectedBookingFinalization(result, pipeline.ref);
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

  // Fully covered checkouts (promo/referral/credit → R0) settle on confirm without a
  // Paystack charge. Short-circuit before calling Paystack so success pages stay green.
  const adminPrePaystack = getSupabaseAdmin();
  if (adminPrePaystack) {
    const settled = await findBookingIdStatusForPaystackReference(adminPrePaystack, reference);
    if (settled) {
      const { data: payRow } = await adminPrePaystack
        .from("bookings")
        .select("payment_status, amount_paid_cents")
        .eq("id", settled.bookingId)
        .maybeSingle();
      const paymentStatus = String(
        (payRow as { payment_status?: string | null } | null)?.payment_status ?? "",
      )
        .trim()
        .toLowerCase();
      const rawAmountCents = (payRow as { amount_paid_cents?: unknown } | null)?.amount_paid_cents;
      if ((paymentStatus === "success" || paymentStatus === "paid") &&
        typeof rawAmountCents === "number" && Number.isInteger(rawAmountCents) && rawAmountCents === 0) {
        const amountCents = Number(
          (payRow as { amount_paid_cents?: number | null } | null)?.amount_paid_cents ?? 0,
        );
        const bookingReference = await loadBookingReferenceForId(
          adminPrePaystack,
          settled.bookingId,
        );
        return NextResponse.json({
          success: true,
          ok: true,
          paymentStatus: "success",
          reference,
          amountCents: Number.isFinite(amountCents) ? amountCents : 0,
          currency: "ZAR",
          customerEmail: "",
          customerName: null,
          userId: null,
          bookingSnapshot: null,
          bookingInDatabase: true,
          bookingId: settled.bookingId,
          bookingReference,
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
        } satisfies PaystackVerifyPostResponse);
      }
    }
  }

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
  /**
   * M-5: monthly-invoice routing must run BEFORE the booking lookup short-circuit. Otherwise
   * `findBookingIdStatusForPaystackReference` would never match a monthly invoice (its lookup
   * targets `bookings.paystack_reference`, not `monthly_invoices.paystack_reference`), and
   * we'd silently fall into the booking-finalize pipeline.
   */
  if (adminPost) {
    const monthlyRoutingPost = await routePaystackChargeForMonthlyInvoice(adminPost, {
      reference: ref,
      amountCents: txAmount,
      invoiceIdHint: monthlyInvoiceIdFromPaystackMetadata(
        normalizePaystackMetadata(tx.metadata) as unknown as Record<string, unknown>,
      ),
    });
    if (shouldShortCircuitForMonthlyInvoice(monthlyRoutingPost)) {
      await logSystemEvent({
        level: "info",
        source: "paystack/verify",
        message: "monthly_invoice.charge.success",
        context: {
          reference: ref,
          routing_kind: monthlyRoutingPost.kind,
          ...(monthlyRoutingPost.kind === "monthly_settled"
            ? { invoiceId: monthlyRoutingPost.invoiceId, settled: monthlyRoutingPost.settled }
            : { reason: monthlyRoutingPost.reason }),
        },
      });
      if (monthlyRoutingPost.kind === "monthly_settled" || monthlyRoutingPost.kind === "monthly_already_processed") {
        const skipLedger =
          monthlyRoutingPost.kind === "monthly_already_processed" &&
          monthlyRoutingPost.reason === "amount_mismatch_quarantined";
        const invoiceId =
          monthlyRoutingPost.kind === "monthly_settled"
            ? monthlyRoutingPost.invoiceId
            : monthlyInvoiceIdFromPaystackMetadata(
                normalizePaystackMetadata(tx.metadata) as unknown as Record<string, unknown>,
              );
        if (invoiceId && !skipLedger) {
          await recordPaystackMonthlyInvoicePayment(adminPost, {
            reference: ref,
            amountCents: txAmount,
            invoiceId,
            paidAtIso: typeof tx.paid_at === "string" ? tx.paid_at : null,
            chargeData: paystackChargeDataFromRecord(tx as Record<string, unknown>),
          });
        }
      }
      const metadataMonthly = normalizePaystackMetadata(tx.metadata);
      const { snapshot: snapMonthly } = parseBookingSnapshot(metadataMonthly, { amountCents: txAmount });
      const emailFromCustomerMonthly = typeof tx.customer?.email === "string" ? tx.customer.email.trim() : "";
      const emailRawMonthly =
        emailFromCustomerMonthly ||
        (typeof metadataMonthly.customer_email === "string" ? metadataMonthly.customer_email : "") ||
        "";
      const emailNormMonthly = emailRawMonthly ? normalizeEmail(emailRawMonthly) : "";
      const userIdMonthly = resolvePaystackUserId(snapMonthly, metadataMonthly);
      return NextResponse.json({
        success: true,
        ok: true,
        paymentStatus: "success",
        reference: ref,
        amountCents: txAmount,
        currency: txCurrency,
        customerEmail: emailNormMonthly,
        customerName: snapMonthly?.customer?.name?.trim() ?? null,
        userId: userIdMonthly,
        bookingSnapshot: snapMonthly ?? null,
        bookingInDatabase: false,
        bookingId: null,
        state: monthlyInvoiceVerifyState(monthlyRoutingPost),
        alreadyExists: monthlyRoutingPost.kind === "monthly_already_processed",
        skipped: monthlyRoutingPost.kind === "monthly_already_processed",
        upsertError: null,
        assignmentType: null,
        fallbackReason: null,
        showCleanerSubstitutionNotice: false,
        attemptedCleanerId: null,
        assignedCleanerId: null,
        selectedCleanerId: null,
        monthlyInvoiceId:
          monthlyRoutingPost.kind === "monthly_settled" ? monthlyRoutingPost.invoiceId : null,
      });
    }

    const salesDocIdHintPost = salesDocumentIdFromPaystackMetadata(
      tx.metadata as Record<string, unknown> | undefined,
    );
    const salesRoutingPost = await routePaystackChargeForSalesDocument(adminPost, {
      reference: ref,
      amountCents: txAmount,
      documentIdHint: salesDocIdHintPost,
    });
    if (shouldShortCircuitForSalesDocument(salesRoutingPost)) {
      await logSystemEvent({
        level: "info",
        source: "paystack/verify",
        message: "sales_document.charge.success",
        context: {
          reference: ref,
          routing_kind: salesRoutingPost.kind,
          ...(salesRoutingPost.kind === "sales_doc_settled"
            ? { documentId: salesRoutingPost.documentId }
            : { reason: salesRoutingPost.reason }),
        },
      });
      if (salesRoutingPost.kind === "sales_doc_settled" || salesRoutingPost.kind === "sales_doc_already_processed") {
        const documentId =
          salesRoutingPost.kind === "sales_doc_settled"
            ? salesRoutingPost.documentId
            : salesDocIdHintPost;
        if (documentId) {
          await recordPaystackSalesDocumentPayment(adminPost, {
            reference: ref,
            amountCents: txAmount,
            documentId,
            paidAtIso: typeof tx.paid_at === "string" ? tx.paid_at : null,
            chargeData: paystackChargeDataFromRecord(tx as Record<string, unknown>),
          });
        }
      }
      const metadataSales = normalizePaystackMetadata(tx.metadata);
      const { snapshot: snapSales } = parseBookingSnapshot(metadataSales, { amountCents: txAmount });
      const emailFromCustomerSales = typeof tx.customer?.email === "string" ? tx.customer.email.trim() : "";
      const emailRawSales =
        emailFromCustomerSales ||
        (typeof metadataSales.customer_email === "string" ? metadataSales.customer_email : "") ||
        "";
      const emailNormSales = emailRawSales ? normalizeEmail(emailRawSales) : "";
      const userIdSales = resolvePaystackUserId(snapSales, metadataSales);
      return NextResponse.json({
        success: true,
        ok: true,
        paymentStatus: "success",
        reference: ref,
        amountCents: txAmount,
        currency: txCurrency,
        customerEmail: emailNormSales,
        customerName: snapSales?.customer?.name?.trim() ?? null,
        userId: userIdSales,
        bookingSnapshot: snapSales ?? null,
        bookingInDatabase: false,
        bookingId: null,
        state: salesRoutingPost.kind === "sales_doc_settled" ? "paid" : "already_processed",
        alreadyExists: salesRoutingPost.kind === "sales_doc_already_processed",
        skipped: salesRoutingPost.kind === "sales_doc_already_processed",
        upsertError: null,
        assignmentType: null,
        fallbackReason: null,
        showCleanerSubstitutionNotice: false,
        attemptedCleanerId: null,
        assignedCleanerId: null,
        selectedCleanerId: null,
        salesDocumentId:
          salesRoutingPost.kind === "sales_doc_settled" ? salesRoutingPost.documentId : null,
      });
    }
    if (salesRoutingPost.kind === "sales_doc_error") {
      return NextResponse.json(
        {
          success: false,
          ok: false,
          paymentStatus: "unknown",
          error: salesRoutingPost.error,
          reference: ref,
        },
        { status: 409 },
      );
    }
    if (isSalesDocumentPaystackReference(ref)) {
      return NextResponse.json(
        {
          success: false,
          ok: false,
          paymentStatus: "unknown",
          error: "sales_document_payment_not_applied",
          reference: ref,
        },
        { status: 409 },
      );
    }
  }
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
      if (!await provePersistedPaystackReplay({
        supabase: adminPost, bookingId: existingPost.bookingId, reference: ref,
        amountCents: txAmount, customerEmail: typeof tx.customer?.email === "string" ? tx.customer.email : "",
        metadata: tx.metadata,
      })) {
        return NextResponse.json({ ok: false, success: false, paymentStatus: "unknown",
          reference: ref, error: "PAYMENT_FINALIZATION_REPLAY_MISMATCH" }, { status: 409 });
      }
      await replayPaymentConfirmedNotifyForPersistedBooking({
        supabase: adminPost,
        bookingId: existingPost.bookingId,
        paystackReference: ref,
        amountCents: txAmount,
        metadata: tx.metadata,
        snapshot: snapShort,
        customerEmailHint: emailNorm || emailFromCustomerPost || undefined,
      });
      await recordPaystackBookingPayment(adminPost, {
        reference: ref,
        amountCents: txAmount,
        bookingId: existingPost.bookingId,
        currency: txCurrency,
        paidAtIso: typeof tx.paid_at === "string" ? tx.paid_at : null,
        chargeData: paystackChargeDataFromRecord(tx as Record<string, unknown>),
      });
      const bookingReference = await loadBookingReferenceForId(adminPost, existingPost.bookingId);
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
        bookingReference,
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

  if (result.error || result.ok === false) return rejectedBookingFinalization(result, ref);

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

  const bookingReference = adminPost
    ? await loadBookingReferenceForId(adminPost, result.bookingId)
    : null;

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
    bookingReference,
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
