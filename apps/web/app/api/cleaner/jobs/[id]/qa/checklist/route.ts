import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  bookingStatusAllowsServiceQaMutation,
  resolveCleanerBookingForQa,
} from "@/lib/booking/bookingServiceQaServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: bookingId } = await ctx.params;
  if (!bookingId) {
    return NextResponse.json({ error: "Missing booking id." }, { status: 400 });
  }

  let body: { section_key?: string; completed?: boolean; notes?: string | null };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const sectionKey = typeof body.section_key === "string" ? body.section_key.trim().toLowerCase() : "";
  if (!sectionKey) {
    return NextResponse.json({ error: "section_key required." }, { status: 400 });
  }
  if (typeof body.completed !== "boolean") {
    return NextResponse.json({ error: "completed must be a boolean." }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  }

  const resolved = await resolveCleanerBookingForQa(admin, request, bookingId);
  if (!resolved.ok) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }

  if (!bookingStatusAllowsServiceQaMutation(resolved.booking.status)) {
    return NextResponse.json({ error: "Cannot update checklist for this booking status." }, { status: 409 });
  }

  if (!resolved.profile.sections.includes(sectionKey)) {
    return NextResponse.json({ error: "Invalid section for this service." }, { status: 400 });
  }

  const notes =
    body.notes === undefined ? null : typeof body.notes === "string" ? body.notes.trim().slice(0, 2000) || null : null;
  const completedAt = body.completed ? new Date().toISOString() : null;

  const { error } = await admin.from("booking_service_checklists").upsert(
    {
      booking_id: bookingId,
      cleaner_id: resolved.cleanerId,
      section_key: sectionKey,
      completed: body.completed,
      completed_at: completedAt,
      notes,
    },
    { onConflict: "booking_id,cleaner_id,section_key" },
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
