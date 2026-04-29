import { NextResponse } from "next/server";
import { collectLocationIdsWithActiveCleaners } from "@/lib/booking/activeCleanerLocationIds";
import { getSupabaseAdmin, supabaseAdminNotConfiguredBody } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export type ServiceLocationRow = {
  id: string;
  name: string;
  slug: string;
  city: string | null;
  city_id: string | null;
};

/**
 * Public list of bookable service areas for suburb pickers.
 * Default: only locations with at least one active (non-offline) cleaner.
 * `?withActiveCleanersOnly=false` returns all `locations` rows (e.g. admin tools).
 */
export async function GET(request: Request) {
  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ ok: false, ...supabaseAdminNotConfiguredBody() }, { status: 503 });
  }
  const url = new URL(request.url);
  const withActiveCleanersOnly = url.searchParams.get("withActiveCleanersOnly") !== "false";

  const { data, error } = await admin
    .from("locations")
    .select("id, name, slug, city, city_id")
    .order("city", { ascending: true })
    .order("name", { ascending: true });
  if (error) {
    console.error("[api/booking/service-locations]", error.message);
    return NextResponse.json({ ok: false, error: "Could not load areas." }, { status: 500 });
  }
  let rows = (data ?? []) as ServiceLocationRow[];
  if (withActiveCleanersOnly && rows.length > 0) {
    const cover = await collectLocationIdsWithActiveCleaners(admin);
    if (cover.size > 0) {
      rows = rows.filter((r) => cover.has(String(r.id).trim().toLowerCase()));
    }
  }
  return NextResponse.json({ ok: true as const, locations: rows });
}
