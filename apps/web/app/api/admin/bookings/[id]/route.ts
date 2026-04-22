import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth/admin";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!id) {
    return NextResponse.json({ error: "Missing booking id." }, { status: 400 });
  }

  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "").trim() ?? "";
  if (!token) {
    return NextResponse.json({ error: "Missing authorization." }, { status: 401 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  }

  const pub = createClient(url, anon);
  const {
    data: { user },
  } = await pub.auth.getUser(token);
  if (!user?.email || !isAdmin(user.email)) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  }

  const { data: booking, error } = await admin
    .from("bookings")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!booking) {
    return NextResponse.json({ error: "Booking not found." }, { status: 404 });
  }

  const cleanerId = typeof booking.cleaner_id === "string" ? booking.cleaner_id : null;
  const userId = typeof booking.user_id === "string" ? booking.user_id : null;

  const cleanerPromise = cleanerId
    ? admin
        .from("cleaners")
        .select("id, full_name, email, phone, status, rating")
        .eq("id", cleanerId)
        .maybeSingle()
    : Promise.resolve({ data: null, error: null });

  const userProfilePromise = userId
    ? admin
        .from("user_profiles")
        .select("id, email, full_name, phone, tier")
        .eq("id", userId)
        .maybeSingle()
    : Promise.resolve({ data: null, error: null });

  const [{ data: cleaner }, { data: userProfile }] = await Promise.all([cleanerPromise, userProfilePromise]);

  return NextResponse.json({
    booking,
    cleaner: cleaner ?? null,
    userProfile: userProfile ?? null,
  });
}

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: "Missing booking id." }, { status: 400 });

  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "").trim() ?? "";
  if (!token) return NextResponse.json({ error: "Missing authorization." }, { status: 401 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const pub = createClient(url, anon);
  const {
    data: { user },
  } = await pub.auth.getUser(token);
  if (!user?.email || !isAdmin(user.email)) return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  let body: { status?: string; date?: string; time?: string };
  try {
    body = (await request.json()) as { status?: string; date?: string; time?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const updates: Record<string, unknown> = {};

  if (body.status != null) {
    const status = String(body.status).trim().toLowerCase();
    const allowed = new Set(["pending", "assigned", "in_progress", "completed", "cancelled", "failed"]);
    if (!allowed.has(status)) return NextResponse.json({ error: "Invalid status." }, { status: 400 });
    updates.status = status;
  }
  if (body.date != null) {
    const date = String(body.date).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ error: "Invalid date format." }, { status: 400 });
    updates.date = date;
  }
  if (body.time != null) {
    const time = String(body.time).trim();
    if (!/^\d{2}:\d{2}(:\d{2})?$/.test(time)) return NextResponse.json({ error: "Invalid time format." }, { status: 400 });
    updates.time = time.length === 5 ? `${time}:00` : time;
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields provided." }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const { error } = await admin.from("bookings").update(updates).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
