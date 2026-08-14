import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/requireAdminApi";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { id: bookingId } = await ctx.params;
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const body = (await request.json().catch(() => null)) as { reason?: string; source?: "admin" | "supervisor" | "manager" } | null;
  const reason = String(body?.reason ?? "").trim().slice(0, 500);
  if (reason.length < 5) return NextResponse.json({ error: "Enter a reason for approving the early finish." }, { status: 400 });
  const source = body?.source === "supervisor" || body?.source === "manager" ? body.source : "admin";

  const { data: pending, error: requestError } = await admin
    .from("cleaner_early_finish_requests")
    .select("id,status")
    .eq("booking_id", bookingId)
    .eq("status", "pending")
    .order("requested_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (requestError) return NextResponse.json({ error: requestError.message }, { status: 500 });
  if (!pending) return NextResponse.json({ error: "No pending early-finish request was found for this booking." }, { status: 404 });

  const now = new Date().toISOString();
  const { error: approvalError } = await admin
    .from("cleaner_early_finish_requests")
    .update({
      status: "admin_approved",
      approved_at: now,
      approved_by: auth.email || auth.userId,
      approval_source: source,
      updated_at: now,
      metadata: { admin_reason: reason },
    })
    .eq("id", pending.id)
    .eq("status", "pending");
  if (approvalError) return NextResponse.json({ error: approvalError.message }, { status: 500 });

  const { data: booking, error: bookingReadError } = await admin.from("bookings").select("booking_snapshot").eq("id", bookingId).maybeSingle();
  if (bookingReadError || !booking) return NextResponse.json({ error: bookingReadError?.message ?? "Booking not found." }, { status: bookingReadError ? 500 : 404 });
  const snapshot = booking.booking_snapshot && typeof booking.booking_snapshot === "object" && !Array.isArray(booking.booking_snapshot)
    ? { ...(booking.booking_snapshot as Record<string, unknown>) }
    : {};
  snapshot.early_finish_approval = { request_id: pending.id, source, approved_at: now, approved_by: auth.email || auth.userId, reason };
  const { error: updateError } = await admin.from("bookings").update({ booking_snapshot: snapshot }).eq("id", bookingId);
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  return NextResponse.json({ ok: true, requestId: pending.id, status: "admin_approved", source });
}
