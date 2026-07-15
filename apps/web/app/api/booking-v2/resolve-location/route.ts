import { NextResponse } from "next/server";
import { resolveBookingV2LocationContext } from "@/lib/booking-v2/bookingV2LocationContext";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  }

  const url = new URL(request.url);
  const suburb = url.searchParams.get("suburb")?.trim() ?? "";
  if (suburb.length < 2) {
    return NextResponse.json({ error: "suburb is required." }, { status: 400 });
  }

  if (suburb.toLowerCase() === "other") {
    return NextResponse.json(
      {
        ok: false,
        code: "unsupported_area",
        error:
          "We don’t currently list that area for instant online booking. Choose a nearby supported suburb, or contact us to check coverage.",
      },
      { status: 422 },
    );
  }

  const ctx = await resolveBookingV2LocationContext(admin, suburb);
  if (!ctx) {
    return NextResponse.json(
      {
        ok: false,
        code: "unresolved_suburb",
        error:
          "We could not match that suburb to a service area. Choose a suburb from the list, or contact us if you need coverage nearby.",
      },
      { status: 422 },
    );
  }

  return NextResponse.json({
    ok: true,
    locationId: ctx.locationId,
    cityId: ctx.cityId,
    latitude: ctx.latitude,
    longitude: ctx.longitude,
  });
}
