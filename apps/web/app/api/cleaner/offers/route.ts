import { NextResponse } from "next/server";
import { resolveCleanerIdFromRequest } from "@/lib/cleaner/session";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  const session = await resolveCleanerIdFromRequest(request, admin);
  if (!session.cleanerId) return NextResponse.json({ error: session.error ?? "Unauthorized." }, { status: session.status ?? 401 });
  const cleanerId = session.cleanerId;

  const { data: offers, error } = await admin
    .from("dispatch_offers")
    .select("id, booking_id, cleaner_id, status, expires_at, created_at")
    .eq("cleaner_id", cleanerId)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const bookingIds = (offers ?? []).map((o) => String(o.booking_id)).filter(Boolean);
  let bookingById = new Map<string, Record<string, unknown>>();
  if (bookingIds.length > 0) {
    const { data: rows } = await admin
      .from("bookings")
      .select("id, service, date, time, location, customer_name, customer_phone, status, total_paid_zar")
      .in("id", bookingIds);
    bookingById = new Map((rows ?? []).map((r) => [String((r as { id: string }).id), r as Record<string, unknown>]));
  }

  return NextResponse.json({
    offers: (offers ?? []).map((o) => ({
      ...o,
      booking: bookingById.get(String(o.booking_id)) ?? null,
    })),
  });
}
