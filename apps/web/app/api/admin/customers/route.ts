import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth/admin";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type BookingRow = {
  customer_email: string | null;
  total_paid_zar: number | null;
  amount_paid_cents: number | null;
  created_at: string;
};

export async function GET(request: Request) {
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

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const { data, error } = await admin
    .from("bookings")
    .select("customer_email, total_paid_zar, amount_paid_cents, created_at")
    .order("created_at", { ascending: false })
    .limit(5000);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const byEmail = new Map<string, { totalBookings: number; totalSpendZar: number; lastBookingAt: string | null }>();
  for (const r of (data ?? []) as BookingRow[]) {
    const email = r.customer_email?.trim().toLowerCase();
    if (!email) continue;
    const paid =
      typeof r.total_paid_zar === "number" ? r.total_paid_zar : Math.round((r.amount_paid_cents ?? 0) / 100);
    const cur = byEmail.get(email) ?? { totalBookings: 0, totalSpendZar: 0, lastBookingAt: null };
    cur.totalBookings += 1;
    cur.totalSpendZar += paid;
    if (!cur.lastBookingAt || r.created_at > cur.lastBookingAt) cur.lastBookingAt = r.created_at;
    byEmail.set(email, cur);
  }

  const now = Date.now();
  const customers = [...byEmail.entries()].map(([email, v]) => {
    const recentMs = v.lastBookingAt ? now - new Date(v.lastBookingAt).getTime() : Number.MAX_SAFE_INTEGER;
    return {
      email,
      totalBookings: v.totalBookings,
      totalSpendZar: v.totalSpendZar,
      lastBookingAt: v.lastBookingAt,
      status: recentMs <= 1000 * 60 * 60 * 24 * 90 ? "active" : "inactive",
    };
  });

  return NextResponse.json({ customers });
}
