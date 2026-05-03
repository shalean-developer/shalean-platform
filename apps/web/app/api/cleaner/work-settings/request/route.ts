import { NextResponse } from "next/server";
import { validateCleanerAvailabilityWeekdaysForAdmin } from "@/lib/cleaner/availabilityWeekdays";
import { normalizeRequestedPreferredAreas } from "@/lib/cleaner/normalizeRequestedPreferredAreas";
import { resolveCleanerFromRequest } from "@/lib/cleaner/resolveCleanerFromRequest";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  }

  const session = await resolveCleanerFromRequest(request, admin);
  if (!session.ok) {
    return NextResponse.json({ error: session.error }, { status: session.status });
  }

  const cleanerId = session.cleaner.id;

  let body: { requested_locations?: unknown; requested_location?: unknown; requested_days?: unknown; note?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const locCheck = normalizeRequestedPreferredAreas(body);
  if (!locCheck.ok) {
    return NextResponse.json({ error: locCheck.error }, { status: 400 });
  }

  const daysCheck = validateCleanerAvailabilityWeekdaysForAdmin(body.requested_days);
  if (!daysCheck.ok) {
    return NextResponse.json({ error: daysCheck.error }, { status: 400 });
  }

  const noteRaw = body.note != null ? String(body.note).trim() : "";
  const note = noteRaw.length > 2000 ? noteRaw.slice(0, 2000) : noteRaw;

  const { data: pending, error: pendErr } = await admin
    .from("cleaner_change_requests")
    .select("id")
    .eq("cleaner_id", cleanerId)
    .eq("status", "pending")
    .limit(1);

  if (pendErr && !pendErr.message?.toLowerCase().includes("does not exist")) {
    return NextResponse.json({ error: pendErr.message }, { status: 500 });
  }
  if (Array.isArray(pending) && pending.length > 0) {
    return NextResponse.json({ error: "You already have a change request waiting for review." }, { status: 409 });
  }

  const { data: inserted, error: insErr } = await admin
    .from("cleaner_change_requests")
    .insert({
      cleaner_id: cleanerId,
      requested_locations: locCheck.value,
      requested_days: daysCheck.value,
      note: note || null,
      status: "pending",
    })
    .select("id, status, created_at")
    .maybeSingle();

  if (insErr) {
    const code = (insErr as { code?: string }).code;
    const msg = insErr.message ?? "";
    if (code === "23505" || msg.toLowerCase().includes("cleaner_change_requests_one_pending")) {
      return NextResponse.json({ error: "You already have a change request waiting for review." }, { status: 409 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  return NextResponse.json({ ok: true, request: inserted });
}
