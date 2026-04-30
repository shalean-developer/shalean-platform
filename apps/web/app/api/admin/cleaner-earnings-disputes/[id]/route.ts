import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/requireAdminApi";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  status?: string;
  admin_response?: string | null;
  /** Optional: record a manual adjustment when resolving (does not change cleaner_earnings row). */
  adjustment_amount_cents?: number | null;
  adjustment_reason?: string | null;
};

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(String(id ?? "").trim())) {
    return NextResponse.json({ error: "Invalid dispute id." }, { status: 400 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const nextStatus = String(body.status ?? "").toLowerCase().trim();
  if (!["reviewing", "resolved", "rejected"].includes(nextStatus)) {
    return NextResponse.json({ error: "status must be reviewing, resolved, or rejected." }, { status: 400 });
  }

  const note = typeof body.admin_response === "string" ? body.admin_response.trim() : "";
  if ((nextStatus === "resolved" || nextStatus === "rejected") && note.length < 1) {
    return NextResponse.json({ error: "admin_response is required when resolving or rejecting." }, { status: 400 });
  }
  if (note.length > 8000) {
    return NextResponse.json({ error: "admin_response too long." }, { status: 400 });
  }

  const { data: existing, error: exErr } = await admin
    .from("cleaner_earnings_disputes")
    .select("id, cleaner_id, booking_id, status")
    .eq("id", id)
    .maybeSingle();
  if (exErr) return NextResponse.json({ error: exErr.message }, { status: 500 });
  const row = existing as { id?: string; cleaner_id?: string; booking_id?: string; status?: string } | null;
  if (!row?.id) return NextResponse.json({ error: "Dispute not found." }, { status: 404 });

  const cur = String(row.status ?? "").toLowerCase();
  if (cur === "resolved" || cur === "rejected") {
    return NextResponse.json({ error: "Dispute is already closed." }, { status: 409 });
  }

  const now = new Date().toISOString();
  const resolvedAt = nextStatus === "resolved" || nextStatus === "rejected" ? now : null;

  const patch: Record<string, unknown> = {
    status: nextStatus,
    resolved_at: resolvedAt,
  };
  if (nextStatus === "resolved" || nextStatus === "rejected") {
    patch.admin_response = note;
  } else if (note.length > 0) {
    patch.admin_response = note;
  }

  const { data: updated, error: upErr } = await admin.from("cleaner_earnings_disputes").update(patch).eq("id", id).select("id, status, admin_response, resolved_at").maybeSingle();

  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  const adjRaw = body.adjustment_amount_cents;
  const adjReason = typeof body.adjustment_reason === "string" ? body.adjustment_reason.trim() : "";
  if (nextStatus === "resolved" && adjRaw != null && Number.isFinite(Number(adjRaw)) && Math.round(Number(adjRaw)) !== 0) {
    if (adjReason.length < 2) {
      return NextResponse.json({ error: "adjustment_reason required when posting an adjustment." }, { status: 400 });
    }
    const amount = Math.round(Number(adjRaw));
    const { error: adjErr } = await admin.from("cleaner_earnings_adjustments").insert({
      cleaner_id: row.cleaner_id,
      booking_id: row.booking_id,
      amount_cents: amount,
      reason: adjReason.slice(0, 4000),
      dispute_id: id,
    });
    if (adjErr) return NextResponse.json({ error: adjErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, dispute: updated });
}
