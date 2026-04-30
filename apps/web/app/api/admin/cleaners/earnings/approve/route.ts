import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/requireAdminApi";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = { booking_id?: string; earnings_id?: string; cleaner_id?: string };

export async function POST(request: Request) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const earningsId = typeof body.earnings_id === "string" ? body.earnings_id.trim() : "";
  const bookingId = typeof body.booking_id === "string" ? body.booking_id.trim() : "";
  const cleanerId = typeof body.cleaner_id === "string" ? body.cleaner_id.trim() : "";
  if (!/^[0-9a-f-]{36}$/i.test(earningsId) && !/^[0-9a-f-]{36}$/i.test(bookingId) && !/^[0-9a-f-]{36}$/i.test(cleanerId)) {
    return NextResponse.json({ error: "Provide a valid earnings_id, booking_id, or cleaner_id." }, { status: 400 });
  }

  const approvedAt = new Date().toISOString();

  if (/^[0-9a-f-]{36}$/i.test(earningsId)) {
    const { data, error } = await admin
      .from("cleaner_earnings")
      .update({ status: "approved", approved_at: approvedAt })
      .eq("id", earningsId)
      .eq("status", "pending")
      .select("id, booking_id, cleaner_id, amount_cents, status")
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) {
      return NextResponse.json({ error: "Earnings row not found or not in pending status." }, { status: 404 });
    }
    return NextResponse.json({ ok: true, earnings: data });
  }

  if (/^[0-9a-f-]{36}$/i.test(bookingId)) {
    const { data, error } = await admin
      .from("cleaner_earnings")
      .update({ status: "approved", approved_at: approvedAt })
      .eq("booking_id", bookingId)
      .eq("status", "pending")
      .select("id, booking_id, cleaner_id, amount_cents, status")
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) {
      return NextResponse.json({ error: "No pending cleaner_earnings row for this booking." }, { status: 404 });
    }
    return NextResponse.json({ ok: true, earnings: data });
  }

  const { data, error } = await admin
    .from("cleaner_earnings")
    .update({ status: "approved", approved_at: approvedAt })
    .eq("cleaner_id", cleanerId)
    .eq("status", "pending")
    .select("id, booking_id, cleaner_id, amount_cents, status");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const updated = data ?? [];
  if (updated.length === 0) {
    return NextResponse.json({ error: "No pending cleaner_earnings rows for this cleaner." }, { status: 404 });
  }
  return NextResponse.json({ ok: true, approved_count: updated.length, earnings: updated });
}
