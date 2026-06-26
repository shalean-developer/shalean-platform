import { NextResponse } from "next/server";
import { PaystackDecoupledMetadataError } from "@/lib/booking/paystackBookingIdLookup";
import {
  runPaystackVerifyFinalizePipeline,
  type PaystackChargeVerifyTx,
} from "@/lib/booking/runPaystackVerifyFinalizePipeline";
import {
  routePaystackChargeForMonthlyInvoice,
  shouldShortCircuitForMonthlyInvoice,
} from "@/lib/booking/routePaystackChargeForMonthlyInvoice";
import {
  routePaystackChargeForSalesDocument,
  shouldShortCircuitForSalesDocument,
} from "@/lib/salesDocument/routePaystackChargeForSalesDocument";
import { salesDocumentIdFromPaystackMetadata } from "@/lib/salesDocument/salesDocumentPaystackReference";
import { monthlyInvoiceIdFromPaystackMetadata } from "@/lib/monthlyInvoice/monthlyInvoicePaystackReference";
import { bookingPaymentTotalCents, clampTipZar, type BookingRowPaymentInput } from "@/lib/payments/bookingPaymentSummary";
import { fetchPaystackTransactionVerify } from "@/lib/payments/verifyPaystackTransaction";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { logSystemEvent, reportOperationalIssue } from "@/lib/logging/systemLog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_PAYSTACK_REFERENCE_LEN = 200;

/** Accepts Paystack transaction references (e.g. legacy booking UUID, `pay_…`, alphanumeric refs). */
function isPaystackVerifyApiReference(ref: string): boolean {
  const t = ref.trim();
  if (t.length < 2 || t.length > MAX_PAYSTACK_REFERENCE_LEN) return false;
  return /^[\w.-]+$/.test(t);
}

type UuidBookingPaymentRow = BookingRowPaymentInput & {
  payment_completed_at?: string | null;
  amount_paid_cents?: number | null;
  paystack_reference?: string | null;
  status?: string | null;
};

export async function POST(request: Request) {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret?.trim()) {
    return NextResponse.json({ ok: false, error: "Paystack is not configured." }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const reference =
    body &&
    typeof body === "object" &&
    typeof (body as { reference?: unknown }).reference === "string"
      ? (body as { reference: string }).reference.trim()
      : "";

  if (!reference) {
    return NextResponse.json({ ok: false, error: "Invalid reference." }, { status: 400 });
  }

  const isUuid = UUID_RE.test(reference);
  if (!isUuid && !isPaystackVerifyApiReference(reference)) {
    return NextResponse.json({ ok: false, error: "Invalid reference." }, { status: 400 });
  }

  const tipZar =
    body && typeof body === "object" ? clampTipZar((body as { tipZar?: unknown }).tipZar) : 0;

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ ok: false, error: "Server unavailable." }, { status: 503 });
  }

  let paystackVerifyRef = reference;
  let uuidBookingRow: UuidBookingPaymentRow | null = null;

  if (isUuid) {
    const { data: row, error: loadErr } = await admin
      .from("bookings")
      .select(
        "id, status, cleaner_id, selected_cleaner_id, location_id, city_id, location, date, time, customer_email, service, rooms, bathrooms, extras, total_price, total_paid_zar, booking_snapshot, payment_completed_at, amount_paid_cents, paystack_reference",
      )
      .eq("id", reference)
      .maybeSingle();

    if (loadErr || !row || typeof row !== "object" || !("id" in row)) {
      return NextResponse.json({ ok: false, error: "Booking not found." }, { status: 404 });
    }

    uuidBookingRow = row as UuidBookingPaymentRow;

    if (uuidBookingRow.payment_completed_at != null && String(uuidBookingRow.payment_completed_at).trim() !== "") {
      await logSystemEvent({
        level: "info",
        source: "payments/verify",
        message: "payments_verify.already_finalized_short_circuit",
        context: { bookingId: reference, reference_shape: "booking_uuid" },
      });
      return NextResponse.json({ ok: true, bookingId: reference, alreadyPaid: true });
    }

    const st = String(uuidBookingRow.status ?? "").trim().toLowerCase();
    if (st !== "pending_payment") {
      return NextResponse.json({ ok: false, error: "This booking is not awaiting payment." }, { status: 409 });
    }

    const storedRef = String(uuidBookingRow.paystack_reference ?? "").trim();
    if (storedRef && storedRef !== reference) {
      paystackVerifyRef = storedRef;
      await logSystemEvent({
        level: "info",
        source: "payments/verify",
        message: "payments_verify.paystack_verify_ref_from_row",
        context: { bookingId: reference, stored_prefix: storedRef.slice(0, 16) },
      });
    }

    await logSystemEvent({
      level: "info",
      source: "payments/verify",
      message: "payments_verify.reference_shape",
      context: {
        shape: "booking_uuid",
        verify_api_ref_differs_from_body: paystackVerifyRef !== reference,
      },
    });
  } else {
    await logSystemEvent({
      level: "info",
      source: "payments/verify",
      message: "payments_verify.reference_shape",
      context: { shape: "paystack_reference" },
    });
  }

  let json = await fetchPaystackTransactionVerify(paystackVerifyRef, secret.trim());
  if ((!json.status || !json.data) && isUuid && paystackVerifyRef !== reference) {
    await logSystemEvent({
      level: "info",
      source: "payments/verify",
      message: "payments_verify.paystack_fallback_verify_booking_uuid",
      context: { bookingId: reference },
    });
    json = await fetchPaystackTransactionVerify(reference, secret.trim());
  }

  if (!json.status || !json.data) {
    await reportOperationalIssue("warn", "payments/verify", "paystack_transaction_verify_failed", {
      reference_shape: isUuid ? "booking_uuid" : "paystack_reference",
      message: typeof json.message === "string" ? json.message : null,
    });
    return NextResponse.json(
      { ok: false, error: typeof json.message === "string" ? json.message : "Verification failed." },
      { status: 400 },
    );
  }

  const tx = json.data as PaystackChargeVerifyTx;
  if (tx.status !== "success") {
    return NextResponse.json(
      { ok: false, error: "Payment was not successful.", paystackStatus: tx.status ?? null },
      { status: 400 },
    );
  }

  const currency = typeof tx.currency === "string" ? tx.currency.toUpperCase() : "";
  if (currency && currency !== "ZAR") {
    return NextResponse.json({ ok: false, error: "Unexpected currency." }, { status: 400 });
  }

  const amount = typeof tx.amount === "number" && Number.isFinite(tx.amount) ? tx.amount : 0;
  if (amount <= 0) {
    return NextResponse.json({ ok: false, error: "Invalid amount from Paystack." }, { status: 400 });
  }

  if (isUuid && uuidBookingRow) {
    const expected = bookingPaymentTotalCents(uuidBookingRow, tipZar);
    if (expected == null || expected <= 0) {
      return NextResponse.json({ ok: false, error: "Booking has no payable total set." }, { status: 409 });
    }
    if (Math.abs(amount - expected) > 1) {
      return NextResponse.json({ ok: false, error: "Amount does not match booking total." }, { status: 400 });
    }
  }

  /**
   * M-5: only run monthly-invoice routing for *non-UUID* references. A UUID body reference is, by
   * definition, a booking primary key; passing it into `applyMonthlyInvoicePayment` would always
   * return `not_found` (monthly invoices use Paystack-shape references, not booking UUIDs) so the
   * check is also harmless — but skipping it is cheaper and keeps the booking flow first for the
   * one shape `/api/payments/verify` is dedicated to.
   */
  if (!isUuid) {
    const monthlyRouting = await routePaystackChargeForMonthlyInvoice(admin, {
      reference: paystackVerifyRef,
      amountCents: amount,
      invoiceIdHint: monthlyInvoiceIdFromPaystackMetadata(
        tx.metadata as Record<string, unknown> | undefined,
      ),
    });
    if (shouldShortCircuitForMonthlyInvoice(monthlyRouting)) {
      await logSystemEvent({
        level: "info",
        source: "payments/verify",
        message: "monthly_invoice.charge.success",
        context: {
          reference: paystackVerifyRef,
          routing_kind: monthlyRouting.kind,
          ...(monthlyRouting.kind === "monthly_settled"
            ? { invoiceId: monthlyRouting.invoiceId, settled: monthlyRouting.settled }
            : { reason: monthlyRouting.reason }),
        },
      });
      return NextResponse.json({
        ok: true,
        bookingId: null,
        alreadyPaid: monthlyRouting.kind === "monthly_already_processed",
        monthlyInvoiceId:
          monthlyRouting.kind === "monthly_settled" ? monthlyRouting.invoiceId : null,
        monthlyInvoiceState:
          monthlyRouting.kind === "monthly_settled"
            ? monthlyRouting.settled
            : "already_processed",
      });
    }

    const salesDocIdHint = salesDocumentIdFromPaystackMetadata(
      tx.metadata as Record<string, unknown> | undefined,
    );
    const salesRouting = await routePaystackChargeForSalesDocument(admin, {
      reference: paystackVerifyRef,
      amountCents: amount,
      documentIdHint: salesDocIdHint,
    });
    if (shouldShortCircuitForSalesDocument(salesRouting)) {
      await logSystemEvent({
        level: "info",
        source: "payments/verify",
        message: "sales_document.charge.success",
        context: {
          reference: paystackVerifyRef,
          routing_kind: salesRouting.kind,
          ...(salesRouting.kind === "sales_doc_settled"
            ? { documentId: salesRouting.documentId }
            : { reason: salesRouting.reason }),
        },
      });
      return NextResponse.json({
        ok: true,
        bookingId: null,
        alreadyPaid: salesRouting.kind === "sales_doc_already_processed",
        salesDocumentId:
          salesRouting.kind === "sales_doc_settled" ? salesRouting.documentId : null,
      });
    }
  }

  let pipeline: Awaited<ReturnType<typeof runPaystackVerifyFinalizePipeline>>;
  try {
    pipeline = await runPaystackVerifyFinalizePipeline(tx, reference, "payments/verify");
  } catch (err) {
    if (err instanceof PaystackDecoupledMetadataError) {
      await reportOperationalIssue("warn", "payments/verify", "paystack_decoupled_metadata_error", {
        message: err.message,
      });
      return NextResponse.json({ ok: false, error: err.message }, { status: 400 });
    }
    throw err;
  }

  const { result } = pipeline;

  if (result.reason === "amount_mismatch") {
    await reportOperationalIssue("warn", "payments/verify", "finalize_amount_mismatch", {
      bookingId: result.bookingId ?? null,
    });
    return NextResponse.json(
      { ok: false, error: result.error ?? "Amount does not match booking total." },
      { status: 400 },
    );
  }

  if (result.reason === "finalization_failed") {
    await reportOperationalIssue("warn", "payments/verify", "finalize_finalization_failed", {
      bookingId: result.bookingId ?? null,
    });
    return NextResponse.json(
      { ok: false, error: result.error ?? "Could not confirm payment (booking state changed)." },
      { status: 409 },
    );
  }

  if (!result.bookingId || result.error) {
    await reportOperationalIssue("warn", "payments/verify", "finalize_no_booking_or_error", {
      error: result.error ?? null,
      hasBookingId: Boolean(result.bookingId),
    });
    const status = result.bookingId ? 500 : 400;
    return NextResponse.json(
      { ok: false, error: result.error ?? "Could not confirm payment." },
      { status },
    );
  }

  if (isUuid && result.bookingId !== reference) {
    await logSystemEvent({
      level: "warn",
      source: "payments/verify",
      message: "payments_verify.booking_id_mismatch_uuid_body",
      context: { bodyBookingId: reference, finalizedBookingId: result.bookingId },
    });
  }

  const alreadyPaid = Boolean(result.skipped);
  if (alreadyPaid) {
    await logSystemEvent({
      level: "info",
      source: "payments/verify",
      message: "payments_verify.replay_finalize_skipped",
      context: { bookingId: result.bookingId, body_reference: reference },
    });
  }

  const bookingIdOut = isUuid ? reference : result.bookingId;

  return NextResponse.json({
    ok: true,
    bookingId: bookingIdOut,
    alreadyPaid,
  });
}
