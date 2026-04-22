import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function authUserId(request: Request): Promise<string | null> {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "").trim() ?? "";
  if (!token) return null;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return null;
  const pub = createClient(url, anon);
  const { data, error } = await pub.auth.getUser(token);
  if (error || !data.user?.id) return null;
  return data.user.id;
}

export async function GET(request: Request) {
  const userId = await authUserId(request);
  if (!userId) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  const { data, error } = await admin
    .from("subscriptions")
    .select("id, service_type, frequency, day_of_week, time_slot, address, price_per_visit, status, next_booking_date, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ subscriptions: data ?? [] });
}

export async function PATCH(request: Request) {
  const userId = await authUserId(request);
  if (!userId) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  let body: { id?: string; action?: "pause" | "resume" | "cancel" };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const id = String(body.id ?? "").trim();
  const action = String(body.action ?? "").trim().toLowerCase();
  if (!id) return NextResponse.json({ error: "Missing subscription id." }, { status: 400 });
  if (!["pause", "resume", "cancel"].includes(action)) {
    return NextResponse.json({ error: "Invalid action." }, { status: 400 });
  }
  const nextStatus = action === "pause" ? "paused" : action === "resume" ? "active" : "cancelled";
  const { error } = await admin
    .from("subscriptions")
    .update({ status: nextStatus })
    .eq("id", id)
    .eq("user_id", userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, status: nextStatus });
}
