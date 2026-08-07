import { NextResponse } from "next/server";
import { requireAnyAdminPermissionFromRequest } from "@/lib/admin/requirePermission";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireAnyAdminPermissionFromRequest(request, ["cleaner.view", "application.decide"]);
  if (!auth.ok) return auth.response;

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const { data, error } = await admin
    .from("cleaner_applications")
    .select("id, name, phone, location, city_id, experience, availability, working_areas, working_days, status, created_at")
    .order("created_at", { ascending: false })
    .limit(1000);
  if (error) {
    console.error("Cleaner applications load failed", { code: error.code, userId: auth.user.id });
    return NextResponse.json({ error: "Could not load cleaner applications." }, { status: 500 });
  }

  const today = new Date().toISOString().slice(0, 10);
  const applications = data ?? [];
  const pendingCount = applications.filter((row) => String(row.status ?? "").toLowerCase() === "pending").length;
  const approvedToday = applications.filter(
    (row) => String(row.status ?? "").toLowerCase() === "approved" && String(row.created_at ?? "").slice(0, 10) === today,
  ).length;

  const cleanersCountRes = await admin.from("cleaners").select("id", { count: "exact", head: true });
  const totalCleaners = cleanersCountRes.count ?? 0;

  return NextResponse.json(
    { applications, stats: { pendingCount, approvedToday, totalCleaners } },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
