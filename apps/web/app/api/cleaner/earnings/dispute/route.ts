import { NextResponse } from "next/server";
import { resolveCleanerFromRequest } from "@/lib/cleaner/resolveCleanerFromRequest";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = { booking_id?: string; reason?: string };

/** Active dispute (open or reviewing) for a booking, if any. */
export async function GET(request: Request) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const auth = await resolveCleanerFromRequest(request, admin);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const bookingId = new URL(request.url).searchParams.get("booking_id")?.trim() ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(bookingId)) {
    return NextResponse.json({ error: "Provide booking_id query param." }, { status: 400 });
  }

  const cleanerId = auth.cleaner.id;
  const { data, error } = await admin
    .from("cleaner_earnings_disputes")
    .select("id, status, reason, created_at, admin_response, resolved_at")
    .eq("booking_id", bookingId)
    .eq("cleaner_id", cleanerId)
    .in("status", ["open", "reviewing"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ active: data ?? null });
}

export async function POST(request: Request) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const auth = await resolveCleanerFromRequest(request, admin);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const bookingId = typeof body.booking_id === "string" ? body.booking_id.trim() : "";
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  if (!/^[0-9a-f-]{36}$/i.test(bookingId)) {
    return NextResponse.json({ error: "Provide a valid booking_id." }, { status: 400 });
  }
  if (reason.length < 3 || reason.length > 8000) {
    return NextResponse.json({ error: "Reason must be between 3 and 8000 characters." }, { status: 400 });
  }

  const cleanerId = auth.cleaner.id;

  const { data: booking, error: bErr } = await admin
    .from("bookings")
    .select("id, cleaner_id")
    .eq("id", bookingId)
    .maybeSingle();
  if (bErr) return NextResponse.json({ error: bErr.message }, { status: 500 });
  const bRow = booking as { id?: string; cleaner_id?: string | null } | null;
  if (!bRow?.id || String(bRow.cleaner_id ?? "").trim() !== cleanerId) {
    return NextResponse.json({ error: "Booking not found or not assigned to you." }, { status: 404 });
  }

  const { data: earn, error: eErr } = await admin
    .from("cleaner_earnings")
    .select("id")
    .eq("booking_id", bookingId)
    .eq("cleaner_id", cleanerId)
    .maybeSingle();
  if (eErr) return NextResponse.json({ error: eErr.message }, { status: 500 });
  if (!earn) {
    return NextResponse.json({ error: "No earnings record for this booking yet." }, { status: 400 });
  }

  const { data: inserted, error: insErr } = await admin
    .from("cleaner_earnings_disputes")
    .insert({
      cleaner_id: cleanerId,
      booking_id: bookingId,
      reason,
      status: "open",
    })
    .select("id, status, created_at")
    .maybeSingle();

  if (insErr) {
    if (insErr.code === "23505") {
      return NextResponse.json(
        { error: "You already have an open or in-review dispute for this booking." },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: insErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, dispute: inserted });
}
