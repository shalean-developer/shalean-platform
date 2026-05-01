import { NextResponse } from "next/server";
import { assignCleaner, buildAssignmentFieldsForPaidBookingRow } from "@/lib/booking/assignCleaner";
import { bookingPaymentTotalCents, clampTipZar, type BookingRowPaymentInput } from "@/lib/payments/bookingPaymentSummary";
import { fetchPaystackTransactionVerify } from "@/lib/payments/verifyPaystackTransaction";
import { notifyCleanerAssignedBooking } from "@/lib/dispatch/notifyCleanerAssigned";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { reportOperationalIssue } from "@/lib/logging/systemLog";

async function assignCleanerWithTrace(bookingId: string, source: string): Promise<void> {
  const ar = await assignCleaner(bookingId);
  if (process.env.TRACE_BOOKING_ASSIGN === "1") {
    console.log(
      "[TRACE_BOOKING_ASSIGN]",
      JSON.stringify({ at: new Date().toISOString(), step: "payments/verify", source, bookingId, assignResult: ar }),
    );
  }
  if (!ar.ok) {
    await reportOperationalIssue("warn", "payments/verify", "assignCleaner returned error", {
      bookingId,
      source,
      error: ar.error,
    });
  }
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

  if (!reference || !UUID_RE.test(reference)) {
    return NextResponse.json({ ok: false, error: "Invalid reference." }, { status: 400 });
  }

  const tipZar =
    body && typeof body === "object" ? clampTipZar((body as { tipZar?: unknown }).tipZar) : 0;

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ ok: false, error: "Server unavailable." }, { status: 503 });
  }

  const { data: row, error: loadErr } = await admin
    .from("bookings")
    .select(
      "id, status, cleaner_id, selected_cleaner_id, location_id, city_id, location, date, time, customer_email, service, rooms, bathrooms, extras, total_price, total_paid_zar, booking_snapshot, payment_completed_at, amount_paid_cents",
    )
    .eq("id", reference)
    .maybeSingle();

  if (loadErr || !row || typeof row !== "object" || !("id" in row)) {
    return NextResponse.json({ ok: false, error: "Booking not found." }, { status: 404 });
  }

  const r = row as BookingRowPaymentInput & {
    payment_completed_at?: string | null;
    amount_paid_cents?: number | null;
  };

  if (r.status !== "pending_payment") {
    if (r.payment_completed_at != null && String(r.payment_completed_at).trim() !== "") {
      await assignCleanerWithTrace(r.id, "already_paid_branch");
      return NextResponse.json({ ok: true, bookingId: r.id, alreadyPaid: true });
    }
    return NextResponse.json({ ok: false, error: "This booking is not awaiting payment." }, { status: 409 });
  }

  const json = await fetchPaystackTransactionVerify(reference, secret.trim());
  if (!json.status || !json.data) {
    return NextResponse.json(
      { ok: false, error: typeof json.message === "string" ? json.message : "Verification failed." },
      { status: 400 },
    );
  }

  const tx = json.data;
  if (tx.status !== "success") {
    return NextResponse.json({ ok: false, error: "Payment was not successful.", paystackStatus: tx.status ?? null }, { status: 400 });
  }

  const currency = typeof tx.currency === "string" ? tx.currency.toUpperCase() : "";
  if (currency && currency !== "ZAR") {
    return NextResponse.json({ ok: false, error: "Unexpected currency." }, { status: 400 });
  }

  const amount = typeof tx.amount === "number" && Number.isFinite(tx.amount) ? tx.amount : 0;
  if (amount <= 0) {
    return NextResponse.json({ ok: false, error: "Invalid amount from Paystack." }, { status: 400 });
  }

  const expected = bookingPaymentTotalCents(r, tipZar);
  if (expected == null || expected <= 0) {
    return NextResponse.json({ ok: false, error: "Booking has no payable total set." }, { status: 409 });
  }

  if (Math.abs(amount - expected) > 1) {
    return NextResponse.json({ ok: false, error: "Amount does not match booking total." }, { status: 400 });
  }

  const paidAt = typeof tx.paid_at === "string" && tx.paid_at.trim() ? tx.paid_at.trim() : new Date().toISOString();
  const ref = typeof tx.reference === "string" && tx.reference.trim() ? tx.reference.trim() : reference;

  const totalPaidZar = Math.round(amount / 100);

  const assignFields = await buildAssignmentFieldsForPaidBookingRow(admin, {
    id: r.id,
    status: r.status,
    cleaner_id: (r as { cleaner_id?: string | null }).cleaner_id ?? null,
    selected_cleaner_id: (r as { selected_cleaner_id?: string | null }).selected_cleaner_id ?? null,
    location_id: (r as { location_id?: string | null }).location_id ?? null,
    city_id: (r as { city_id?: string | null }).city_id ?? null,
    location: (r as { location?: string | null }).location ?? null,
    date: (r as { date?: string | null }).date ?? null,
    time: (r as { time?: string | null }).time ?? null,
  });

  const { data: updated, error: upErr } = await admin
    .from("bookings")
    .update({
      payment_status: "success",
      payment_completed_at: paidAt,
      amount_paid_cents: amount,
      total_paid_cents: amount,
      total_paid_zar: totalPaidZar,
      paystack_reference: ref,
      ...assignFields,
    })
    .eq("id", r.id)
    .eq("status", "pending_payment")
    .select("id")
    .maybeSingle();

  if (upErr) {
    return NextResponse.json({ ok: false, error: upErr.message }, { status: 500 });
  }

  if (!updated) {
    const { data: again } = await admin
      .from("bookings")
      .select("id, payment_completed_at, status")
      .eq("id", r.id)
      .maybeSingle();
    const paid = again && typeof again === "object" && (again as { payment_completed_at?: string | null }).payment_completed_at;
    if (paid) {
      await assignCleanerWithTrace(r.id, "race_recovery_branch");
      return NextResponse.json({ ok: true, bookingId: r.id, alreadyPaid: true });
    }
    return NextResponse.json({ ok: false, error: "Could not confirm payment (booking state changed)." }, { status: 409 });
  }

  if (assignFields.cleaner_id) {
    try {
      await notifyCleanerAssignedBooking(admin, r.id, assignFields.cleaner_id);
    } catch {
      /* best-effort */
    }
  }

  await assignCleanerWithTrace(r.id, "post_successful_payment_update");

  return NextResponse.json({ ok: true, bookingId: r.id, alreadyPaid: false });
}
