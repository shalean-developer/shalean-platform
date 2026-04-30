import { NextResponse } from "next/server";
import { resolveCleanerIdFromRequest } from "@/lib/cleaner/session";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  }

  const session = await resolveCleanerIdFromRequest(request, admin);
  if (!session.cleanerId) {
    return NextResponse.json({ error: session.error ?? "Unauthorized." }, { status: session.status ?? 401 });
  }

  const url = new URL(request.url);
  const bookingId = String(url.searchParams.get("booking_id") ?? url.searchParams.get("bookingId") ?? "").trim();
  if (!/^[0-9a-f-]{36}$/i.test(bookingId)) {
    return NextResponse.json({ error: "Missing or invalid booking_id." }, { status: 400 });
  }

  const { data: earningsRow, error: earnErr } = await admin
    .from("cleaner_earnings")
    .select("id, booking_id, cleaner_id, amount_cents, status, created_at, approved_at, paid_at")
    .eq("booking_id", bookingId)
    .eq("cleaner_id", session.cleanerId)
    .maybeSingle();

  if (earnErr) {
    return NextResponse.json({ error: earnErr.message }, { status: 500 });
  }
  if (!earningsRow) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const [{ data: booking, error: bErr }, { data: lineItems, error: liErr }] = await Promise.all([
    admin
      .from("bookings")
      .select("id, service, date, time, status, total_paid_zar, total_price, price_snapshot, amount_paid_cents")
      .eq("id", bookingId)
      .maybeSingle(),
    admin.from("booking_line_items").select("*").eq("booking_id", bookingId).order("created_at", { ascending: true }),
  ]);

  if (bErr) return NextResponse.json({ error: bErr.message }, { status: 500 });
  if (liErr) return NextResponse.json({ error: liErr.message }, { status: 500 });

  return NextResponse.json({
    booking: booking ?? null,
    booking_line_items: lineItems ?? [],
    cleaner_earnings: earningsRow,
  });
}
