import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/auth/evaluateAdminAccess";
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
  const {
    data: { user },
  } = await pub.auth.getUser(token);
  const adminAuth = await requireAdminUser(user);
  if (!adminAuth.ok) return NextResponse.json({ error: adminAuth.error }, { status: adminAuth.status });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const { data, error } = await admin
    .from("cleaner_applications")
    .select("id, name, phone, location, city_id, experience, availability, working_areas, working_days, status, created_at")
    .order("created_at", { ascending: false })
    .limit(1000);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const today = new Date().toISOString().slice(0, 10);
  const applications = data ?? [];
  const pendingCount = applications.filter((row) => String(row.status ?? "").toLowerCase() === "pending").length;
  const approvedToday = applications.filter(
    (row) => String(row.status ?? "").toLowerCase() === "approved" && String(row.created_at ?? "").slice(0, 10) === today,
  ).length;

  const cleanersCountRes = await admin.from("cleaners").select("id", { count: "exact", head: true });
  const totalCleaners = cleanersCountRes.count ?? 0;

  return NextResponse.json({
    applications,
    stats: { pendingCount, approvedToday, totalCleaners },
  });
}
