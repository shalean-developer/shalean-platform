import { NextResponse } from "next/server";
import { resolveLocationContextFromLabel } from "@/lib/booking/resolveLocationId";
import { getSupabaseAdmin, supabaseAdminNotConfiguredBody } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Maps step-1 free-text area/suburb to `locations.id` + `city_id` (same rules as checkout / dispatch).
 * Used by the booking UI so availability, cleaner pool, and lock-time pricing stay aligned with strict mode.
 */
export async function GET(request: Request) {
  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ ok: false, ...supabaseAdminNotConfiguredBody() }, { status: 503 });
  }
  const url = new URL(request.url);
  const label = url.searchParams.get("label")?.trim() ?? "";
  if (!label) {
    return NextResponse.json({ ok: true as const, locationId: null, cityId: null });
  }
  const { locationId, cityId } = await resolveLocationContextFromLabel(admin, label);
  return NextResponse.json({
    ok: true as const,
    locationId: locationId && locationId.trim() ? locationId.trim() : null,
    cityId: cityId && cityId.trim() ? cityId.trim() : null,
  });
}
