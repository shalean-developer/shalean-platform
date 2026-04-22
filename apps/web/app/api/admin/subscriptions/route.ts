import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth/admin";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "").trim() ?? "";
  if (!token) return NextResponse.json({ error: "Missing authorization." }, { status: 401 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  const pub = createClient(url, anon);
  const { data: userData } = await pub.auth.getUser(token);
  if (!userData.user?.email || !isAdmin(userData.user.email)) return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  const { data, error } = await admin
    .from("subscriptions")
    .select("id, user_id, service_type, frequency, time_slot, address, price_per_visit, status, next_booking_date, payment_status, retry_count, last_payment_error, last_charge_reference, last_payment_date")
    .order("next_booking_date", { ascending: true })
    .limit(3000);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ subscriptions: data ?? [] });
}

export async function PATCH(request: Request) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "").trim() ?? "";
  if (!token) return NextResponse.json({ error: "Missing authorization." }, { status: 401 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  const pub = createClient(url, anon);
  const { data: userData } = await pub.auth.getUser(token);
  if (!userData.user?.email || !isAdmin(userData.user.email)) return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  let body: { id?: string; status?: "active" | "paused" | "cancelled"; next_booking_date?: string | null };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const id = String(body.id ?? "").trim();
  if (!id) return NextResponse.json({ error: "Missing subscription id." }, { status: 400 });

  const patch: Record<string, unknown> = {};
  if (body.status) patch.status = body.status;
  if (body.next_booking_date !== undefined) patch.next_booking_date = body.next_booking_date;
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "No changes requested." }, { status: 400 });
  }

  const { error } = await admin.from("subscriptions").update(patch).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
