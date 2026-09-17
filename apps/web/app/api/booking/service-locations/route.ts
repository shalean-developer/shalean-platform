import { NextResponse } from "next/server";
import { collectLocationIdsWithActiveCleaners } from "@/lib/booking/activeCleanerLocationIds";
import { getSupabaseAdmin, supabaseAdminNotConfiguredBody } from "@/lib/supabase/admin";
import { getSupabaseServer } from "@/lib/supabase/server";

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
 * `?withActiveCleanersOnly=false` returns the public location catalogue using
 * the RLS-scoped server client, so the booking picker does not require admin credentials.
 */
export async function GET(request: Request) {
  const startedAt = performance.now();
  const url = new URL(request.url);
  const withActiveCleanersOnly = url.searchParams.get("withActiveCleanersOnly") !== "false";
  const client = withActiveCleanersOnly ? getSupabaseAdmin() : getSupabaseServer();
  if (!client) {
    const errorBody = withActiveCleanersOnly
      ? supabaseAdminNotConfiguredBody()
      : {
          error: "Scheduling is temporarily unavailable. Please try again shortly.",
          errorCode: "SUPABASE_PUBLIC_CLIENT_NOT_CONFIGURED" as const,
        };
    return NextResponse.json({ ok: false, ...errorBody }, { status: 503 });
  }

  let { data, error } = await client
    .from("locations")
    .select("id, name, slug, city, city_id")
    .order("city", { ascending: true })
    .order("name", { ascending: true });
  if (error && /city_id/i.test(error.message)) {
    const fallback = await client
      .from("locations")
      .select("id, name, slug, city")
      .order("city", { ascending: true })
      .order("name", { ascending: true });
    data = fallback.data?.map((row) => ({ ...row, city_id: null })) ?? null;
    error = fallback.error;
  }
  if (error) {
    console.error("[api/booking/service-locations]", error.message);
    return NextResponse.json({ ok: false, error: "Could not load areas." }, { status: 500 });
  }
  let rows = (data ?? []) as ServiceLocationRow[];
  if (withActiveCleanersOnly && rows.length > 0) {
    const cover = await collectLocationIdsWithActiveCleaners(client);
    if (cover.size > 0) {
      rows = rows.filter((r) => cover.has(String(r.id).trim().toLowerCase()));
    }
  }
  return NextResponse.json(
    { ok: true as const, locations: rows },
    {
      headers: {
        "Cache-Control": withActiveCleanersOnly
          ? "private, max-age=15, stale-while-revalidate=30"
          : "private, max-age=120, stale-while-revalidate=300",
        "Server-Timing": `locations;dur=${(performance.now() - startedAt).toFixed(1)}`,
      },
    },
  );
}
