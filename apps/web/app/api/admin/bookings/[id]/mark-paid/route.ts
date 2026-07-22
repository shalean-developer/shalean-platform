import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { adminMarkBookingPaidOperation } from "@/lib/booking/bookingOperations";
import type { AdminMarkPaidMethod } from "@/lib/booking/adminMarkBookingPaid";
import { requireAdminUser } from "@/lib/auth/evaluateAdminAccess";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { assertAdminMarkPaidNotMonthlyInvoiceChild } from "@/lib/admin/adminMarkPaidMonthlyChildGuard";
import { buildAdminWarningPayload } from "@/lib/admin/adminWarningPayload";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: bookingId } = await ctx.params;
  if (!bookingId) {
    return NextResponse.json({ error: "Missing booking id." }, { status: 400 });
  }

  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "").trim() ?? "";
  if (!token) {
    return NextResponse.json({ error: "Missing authorization." }, { status: 401 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  }

  const pub = createClient(url, anon);
  const {
    data: { user },
  } = await pub.auth.getUser(token);
  const adminAuth = await requireAdminUser(user);
  if (!adminAuth.ok) {
    return NextResponse.json({ error: adminAuth.error }, { status: adminAuth.status });
  }

  const adminUserId = adminAuth.userId;
  if (!adminUserId) {
    return NextResponse.json({ error: "Missing admin user id." }, { status: 401 });
  }

  let body: {
    method?: string;
    reference?: string;
    amount_cents?: number;
    settlement_mode?: string;
    deposit_cents?: number;
    reason?: string;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const methodRaw = String(body.method ?? "").trim().toLowerCase();
  if (methodRaw !== "cash" && methodRaw !== "zoho" && methodRaw !== "eft") {
    return NextResponse.json({ error: "method must be \"cash\", \"zoho\", or \"eft\"." }, { status: 400 });
  }
  const method = methodRaw as AdminMarkPaidMethod;

  const reference = typeof body.reference === "string" ? body.reference : undefined;
  const amountCentsOverride =
    body.amount_cents != null && Number.isFinite(Number(body.amount_cents)) ? Number(body.amount_cents) : undefined;

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  }

  const { data: bookingRow, error: bookingLoadErr } = await admin
    .from("bookings")
    .select("monthly_invoice_id, payment_status, is_monthly_billing_booking, billing_type")
    .eq("id", bookingId)
    .maybeSingle();
  if (bookingLoadErr) {
    return NextResponse.json({ ok: false, error: bookingLoadErr.message }, { status: 500 });
  }
  if (!bookingRow) {
    return NextResponse.json({ ok: false, error: "Booking not found." }, { status: 404 });
  }

  const monthlyGuard = assertAdminMarkPaidNotMonthlyInvoiceChild(bookingRow);
  if (!monthlyGuard.ok) {
    return NextResponse.json(
      buildAdminWarningPayload({
        ok: false,
        error: monthlyGuard.message,
        code: monthlyGuard.code,
        indicators: monthlyGuard.indicators,
        warning: {
          code: "admin.payment.monthly_child_mark_paid_blocked",
          domain: "payment",
          severity: "critical",
          action: "blocked",
          message: monthlyGuard.message,
          fields: monthlyGuard.indicators,
        },
      }),
      { status: 409 },
    );
  }

  const settlementMode = String(body.settlement_mode ?? "full").trim().toLowerCase();
  const depositCents =
    body.deposit_cents != null && Number.isFinite(Number(body.deposit_cents))
      ? Math.round(Number(body.deposit_cents))
      : NaN;
  const depositReason = typeof body.reason === "string" ? body.reason : "";

  const op = await adminMarkBookingPaidOperation({
    admin,
    bookingId,
    adminUserId,
    method,
    reference: reference ?? null,
    amountCentsOverride: amountCentsOverride != null && amountCentsOverride > 0 ? Math.round(amountCentsOverride) : null,
    settlementMode: settlementMode === "deposit" ? "deposit" : "full",
    depositCents,
    depositReason,
  });

  if (!op.ok) {
    return NextResponse.json({ ok: false, error: op.message }, { status: op.httpStatus ?? 500 });
  }

  const data = op.data;
  if (!data) {
    return NextResponse.json({ ok: false, error: "Unexpected mark-paid result." }, { status: 500 });
  }

  if (data.variant === "deposit_recorded") {
    return NextResponse.json({
      ok: true,
      deposit_recorded: true,
      deposit_paid_cents: data.deposit_paid_cents,
    });
  }

  if (data.variant === "full_skipped") {
    return NextResponse.json({ ok: true, skipped: true, reason: data.reason });
  }

  if (data.variant === "full_settled") {
    return NextResponse.json({
      ok: true,
      marked_paid: true,
      settlement: data.settlement,
    });
  }

  return NextResponse.json({ ok: false, error: "Unexpected mark-paid result." }, { status: 500 });
}
