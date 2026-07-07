import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin/requireAdminSession";
import { performAdminBookingStatusChange } from "@/lib/admin/performAdminBookingStatusChange";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminSession(request);
  if (!auth.ok) return auth.response;

  const { id: bookingId } = await ctx.params;
  if (!bookingId?.trim()) {
    return NextResponse.json({ error: "Missing booking id." }, { status: 400 });
  }

  let body: { status?: string; reason?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const status = typeof body.status === "string" ? body.status.trim() : "";
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  if (!status) {
    return NextResponse.json({ error: "status is required." }, { status: 400 });
  }
  if (!reason) {
    return NextResponse.json({ error: "reason is required.", code: "reason_required" }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  }

  const result = await performAdminBookingStatusChange({
    admin,
    bookingId: bookingId.trim(),
    status,
    reason,
    adminUserId: auth.user.id,
    adminEmail: auth.user.email,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error, code: result.code }, { status: result.status });
  }

  return NextResponse.json({ ok: true, from_status: result.fromStatus, to_status: result.toStatus });
}
