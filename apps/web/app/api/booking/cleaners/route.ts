import { NextResponse } from "next/server";
import { getAvailableCleaners } from "@/lib/booking/availabilityEngine";
import { slotEligibilityCoreFromBookingCleanersUrl } from "@/lib/booking/canonicalSlotEligibilityParams";
import { getSupabaseAdmin, supabaseAdminNotConfiguredBody } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json(supabaseAdminNotConfiguredBody(), { status: 503 });
  const url = new URL(request.url);
  const core = slotEligibilityCoreFromBookingCleanersUrl(url);
  if (!core) {
    return NextResponse.json({ error: "date and time are required." }, { status: 400 });
  }
  const userLatRaw = url.searchParams.get("lat");
  const userLngRaw = url.searchParams.get("lng");
  const userLat = userLatRaw ? Number(userLatRaw) : null;
  const userLng = userLngRaw ? Number(userLngRaw) : null;
  try {
    const cleaners = await getAvailableCleaners(admin, {
      userLat: Number.isFinite(userLat) ? userLat : null,
      userLng: Number.isFinite(userLng) ? userLng : null,
      selectedDate: core.date,
      selectedTime: core.startTime,
      durationMinutes: core.durationMinutes,
      limit: 5,
      locationId: core.locationId || null,
      locationExpandedIds: core.locationExpandedIds,
      bookingServiceSlug: core.bookingServiceSlug,
    });
    if (process.env.BOOKING_CLEANERS_TRACE === "1") {
      console.log(
        "[/api/booking/cleaners] returning",
        JSON.stringify({
          parsedCore: core,
          userLatHasValue: Number.isFinite(userLat),
          userLngHasValue: Number.isFinite(userLng),
          cleanersReturned: cleaners.length,
        }),
      );
    }
    return NextResponse.json({ cleaners });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch cleaners." },
      { status: 500 },
    );
  }
}
