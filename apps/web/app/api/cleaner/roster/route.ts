import { NextResponse } from "next/server";
import { resolveCleanerFromRequest } from "@/lib/cleaner/resolveCleanerFromRequest";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  }
  const session = await resolveCleanerFromRequest(request, admin);
  if (!session.ok) {
    return NextResponse.json({ error: session.error }, { status: session.status, headers: { "Cache-Control": "no-store" } });
  }

  const cleanerId = session.cleaner.id;
  const start = new Date().toISOString().slice(0, 10);
  const endDate = new Date();
  endDate.setUTCDate(endDate.getUTCDate() + 14);
  const end = endDate.toISOString().slice(0, 10);

  const { data: availRows, error: aErr } = await admin
    .from("cleaner_availability")
    .select("date, start_time, end_time, is_available")
    .eq("cleaner_id", cleanerId)
    .gte("date", start)
    .lte("date", end)
    .order("date", { ascending: true });

  if (aErr) return NextResponse.json({ error: aErr.message }, { status: 500 });

  const { data: clRows, error: clErr } = await admin.from("cleaner_locations").select("location_id").eq("cleaner_id", cleanerId);
  if (clErr) return NextResponse.json({ error: clErr.message }, { status: 500 });

  const locIds = (clRows ?? []).map((r) => String((r as { location_id?: string }).location_id ?? "")).filter(Boolean);
  let areas: { id: string; name: string }[] = [];
  if (locIds.length) {
    const { data: locs, error: locErr } = await admin.from("locations").select("id, name").in("id", locIds);
    if (locErr) return NextResponse.json({ error: locErr.message }, { status: 500 });
    areas = (locs ?? []).map((r) => ({
      id: String((r as { id: string }).id),
      name: String((r as { name?: string }).name ?? "Area"),
    }));
  }

  return NextResponse.json(
    {
      availability: availRows ?? [],
      workingAreas: areas,
    },
    { headers: { "Cache-Control": "private, max-age=60, stale-while-revalidate=120" } },
  );
}
