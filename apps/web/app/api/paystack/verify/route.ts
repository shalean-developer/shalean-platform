import { NextResponse } from "next/server";
import { enqueueFailedJob } from "@/lib/booking/failedJobs";
import { normalizeEmail } from "@/lib/booking/normalizeEmail";
import { parseBookingSnapshot } from "@/lib/booking/paystackChargeTypes";
import { normalizePaystackMetadata } from "@/lib/booking/paystackMetadata";
import { resolvePaystackUserId } from "@/lib/booking/resolvePaystackUserId";
import type { PaystackVerifyPostResponse } from "@/lib/booking/paystackVerifyResponse";
import { upsertBookingFromPaystack } from "@/lib/booking/upsertBookingFromPaystack";
import {
  buildBookingEmailPayload,
  sendAdminNewBookingEmail,
  sendBookingConfirmationEmail,
} from "@/lib/email/sendBookingEmail";
import { logSystemEvent, reportOperationalIssue } from "@/lib/logging/systemLog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export type { PaystackVerifyPostResponse } from "@/lib/booking/paystackVerifyResponse";

type PaystackVerifyData = {
  status?: string;
  reference?: string;
  amount?: number;
  currency?: string;
  paid_at?: string;
  customer?: { email?: string };
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

/**
 * Verifies a Paystack transaction (read-only). Query: ?reference=... or ?trxref=...
 */
export async function GET(request: Request) {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) {
    return NextResponse.json({ error: "Paystack is not configured." }, { status: 503 });
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

  const paid = json.data.status === "success";
  return NextResponse.json({
    ok: paid,
    status: json.data.status,
    reference: json.data.reference ?? reference,
    amount: json.data.amount,
    currency: json.data.currency,
    customerEmail: json.data.customer?.email,
    paidAt: json.data.paid_at,
    metadata: json.data.metadata,
  });
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

  const amount = typeof tx.amount === "number" ? tx.amount : 0;
  const currency = typeof tx.currency === "string" ? tx.currency : "ZAR";
  const metadata = normalizePaystackMetadata(tx.metadata);
  const { snapshot } = parseBookingSnapshot(metadata, { amountCents: amount });

  const emailFromCustomer = typeof tx.customer?.email === "string" ? tx.customer.email.trim() : "";
  const emailRaw =
    emailFromCustomer ||
    (typeof metadata.customer_email === "string" ? metadata.customer_email : "") ||
    "";
  const email = emailRaw ? normalizeEmail(emailRaw) : "";

  const result = await upsertBookingFromPaystack({
    paystackReference: ref,
    amountCents: amount,
    currency,
    customerEmail: email,
    snapshot,
    paystackMetadata: metadata,
  });

  if (result.error) {
    await reportOperationalIssue("error", "paystack/verify", `upsert failed: ${result.error}`, { reference: ref });
  }

  const bookingSaved = result.bookingId != null;
  const alreadyExists = Boolean(result.skipped && result.bookingId);

  if (!bookingSaved) {
    await enqueueFailedJob("booking_insert", {
      paystackReference: ref,
      amountCents: amount,
      currency,
      customerEmail: email,
      snapshot,
      paystackMetadata: metadata,
    });
  }

  const sendEmails =
    email &&
    (bookingSaved
      ? !alreadyExists
      : true /** failsafe: payment succeeded but row not saved — still notify */);

  if (sendEmails) {
    const payload = buildBookingEmailPayload({
      paymentReference: ref,
      amountCents: amount,
      customerEmail: email,
      snapshot,
    });
    const cust = await sendBookingConfirmationEmail(payload);
    if (!cust.sent && cust.error) {
      await reportOperationalIssue("error", "paystack/verify", `confirmation email not sent: ${cust.error}`, {
        reference: ref,
      });
    }
    await sendAdminNewBookingEmail(payload);
  }

  const userId = resolvePaystackUserId(snapshot, metadata);

  if (!bookingSaved) {
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
      alreadyExists: false,
      upsertError: result.error ?? "Could not save booking.",
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
    bookingInDatabase: true,
    bookingId: result.bookingId,
    alreadyExists,
    upsertError: null,
  });
}
