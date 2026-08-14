import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function loadRequest(token: string) {
  const admin = getSupabaseAdmin();
  if (!admin) return { admin: null, request: null, error: "Server configuration error." } as const;
  const { data, error } = await admin
    .from("cleaner_early_finish_requests")
    .select("id,booking_id,status,reason,requested_at,approved_at,approval_source,bookings(customer_name,service,date,time)")
    .eq("approval_token", token)
    .maybeSingle();
  return { admin, request: data, error: error?.message ?? null } as const;
}

export async function GET(_request: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const loaded = await loadRequest(token);
  if (!loaded.admin) return NextResponse.json({ error: loaded.error }, { status: 503 });
  if (loaded.error) return NextResponse.json({ error: loaded.error }, { status: 500 });
  if (!loaded.request) return NextResponse.json({ error: "This confirmation link is invalid or expired." }, { status: 404 });
  return NextResponse.json({ ok: true, request: { status: loaded.request.status, reason: loaded.request.reason, requestedAt: loaded.request.requested_at, approvedAt: loaded.request.approved_at, approvalSource: loaded.request.approval_source, booking: loaded.request.bookings } });
}

export async function POST(request: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const body = (await request.json().catch(() => null)) as { decision?: "approve" | "reject" } | null;
  if (body?.decision !== "approve" && body?.decision !== "reject") return NextResponse.json({ error: "Choose whether the cleaning is complete." }, { status: 400 });

  const loaded = await loadRequest(token);
  if (!loaded.admin) return NextResponse.json({ error: loaded.error }, { status: 503 });
  if (loaded.error) return NextResponse.json({ error: loaded.error }, { status: 500 });
  if (!loaded.request) return NextResponse.json({ error: "This confirmation link is invalid or expired." }, { status: 404 });

  if (["customer_approved", "customer_rejected", "admin_approved"].includes(String(loaded.request.status))) return NextResponse.json({ ok: true, status: loaded.request.status, duplicate: true });
  if (loaded.request.status !== "pending") return NextResponse.json({ error: "This early-finish request is no longer awaiting a customer response." }, { status: 409 });

  const now = new Date().toISOString();
  const approved = body.decision === "approve";
  const patch = approved
    ? { status: "customer_approved", customer_responded_at: now, customer_response: "approved", approved_at: now, approved_by: "customer_confirmation_link", approval_source: "customer", updated_at: now }
    : { status: "customer_rejected", customer_responded_at: now, customer_response: "rejected", updated_at: now };

  const { data: updated, error } = await loaded.admin.from("cleaner_early_finish_requests").update(patch).eq("id", loaded.request.id).eq("status", "pending").select("status").maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!updated) return NextResponse.json({ error: "This request changed. Refresh and try again." }, { status: 409 });

  if (approved) {
    const { data: booking } = await loaded.admin.from("bookings").select("booking_snapshot").eq("id", loaded.request.booking_id).maybeSingle();
    const snapshot = booking?.booking_snapshot && typeof booking.booking_snapshot === "object" && !Array.isArray(booking.booking_snapshot)
      ? { ...(booking.booking_snapshot as Record<string, unknown>) }
      : {};
    snapshot.early_finish_approval = { request_id: loaded.request.id, source: "customer", approved_at: now };
    const { error: bookingError } = await loaded.admin.from("bookings").update({ booking_snapshot: snapshot }).eq("id", loaded.request.booking_id);
    if (bookingError) return NextResponse.json({ error: "Approval was recorded, but the booking could not be unlocked. Please contact Shalean support." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, status: updated.status });
}
