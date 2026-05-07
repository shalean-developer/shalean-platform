import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import {
  adminMarkBookingPaid,
  adminRecordBookingDeposit,
  type AdminMarkPaidMethod,
} from "@/lib/booking/adminMarkBookingPaid";
import { isAdmin } from "@/lib/auth/admin";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

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
  if (!user?.email || !isAdmin(user.email)) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const adminUserId = typeof user.id === "string" && user.id.trim() ? user.id.trim() : "";
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

  const settlementMode = String(body.settlement_mode ?? "full").trim().toLowerCase();
  if (settlementMode === "deposit") {
    const depositCents =
      body.deposit_cents != null && Number.isFinite(Number(body.deposit_cents))
        ? Math.round(Number(body.deposit_cents))
        : NaN;
    const reason = typeof body.reason === "string" ? body.reason : "";
    const dep = await adminRecordBookingDeposit(admin, {
      bookingId,
      depositCents,
      method,
      reference: reference ?? null,
      reason,
      adminUserId,
    });
    if (!dep.ok) {
      return NextResponse.json({ ok: false, error: dep.error }, { status: dep.httpStatus });
    }
    return NextResponse.json({
      ok: true,
      deposit_recorded: true,
      deposit_paid_cents: dep.deposit_paid_cents,
    });
  }

  const result = await adminMarkBookingPaid(admin, {
    bookingId,
    method,
    reference,
    amountCentsOverride: amountCentsOverride != null && amountCentsOverride > 0 ? Math.round(amountCentsOverride) : null,
    adminUserId,
  });

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: result.httpStatus });
  }

  if ("skipped" in result && result.skipped) {
    return NextResponse.json({ ok: true, skipped: true, reason: result.reason });
  }

  if ("marked_paid" in result && result.marked_paid && "settlement" in result) {
    return NextResponse.json({
      ok: true,
      marked_paid: true,
      settlement: result.settlement,
    });
  }

  return NextResponse.json({ ok: false, error: "Unexpected mark-paid result." }, { status: 500 });
}
