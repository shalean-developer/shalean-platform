import { NextResponse } from "next/server";
import { getAvailableTimeSlots } from "@/lib/booking/availabilityEngine";
import { normalizeVipTier } from "@/lib/pricing/vipTier";
import {
  normalizeExtraRoomsRaw,
  parsePricingServiceParams,
  quoteCheckoutZar,
  quoteJobDurationHours,
} from "@/lib/pricing/pricingEngine";
import { getSupabaseAdmin, supabaseAdminNotConfiguredBody } from "@/lib/supabase/admin";

export type TimeSlotWithPricing = {
  time: string;
  available: boolean;
  cleanersCount: number;
  price?: number;
  duration?: number;
  surgeMultiplier?: number;
  surgeApplied?: boolean;
};

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseExtrasParam(raw: string | null): string[] {
  if (!raw || !raw.trim()) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function GET(request: Request) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json(supabaseAdminNotConfiguredBody(), { status: 503 });
  const url = new URL(request.url);
  const selectedDate = url.searchParams.get("date") ?? "";
  const durationQueryFallback = Number(url.searchParams.get("duration") ?? "120");
  const latRaw = Number(url.searchParams.get("lat"));
  const lngRaw = Number(url.searchParams.get("lng"));
  const serviceRaw = (url.searchParams.get("serviceType") ?? "").trim();
  const bedroomsRaw = Number(url.searchParams.get("bedrooms") ?? 1);
  const bathroomsRaw = Number(url.searchParams.get("bathrooms") ?? 1);
  const bedrooms = Number.isFinite(bedroomsRaw) ? Math.max(1, Math.round(bedroomsRaw)) : 1;
  const bathrooms = Number.isFinite(bathroomsRaw) ? Math.max(1, Math.round(bathroomsRaw)) : 1;
  const extraRooms = normalizeExtraRoomsRaw(url.searchParams.get("extraRooms"));
  const extras = parseExtrasParam(url.searchParams.get("extras"));
  /** Guest = omit param → `regular`. Slots must use same tier as lock/checkout or totals diverge. */
  const vipTier = normalizeVipTier(url.searchParams.get("vipTier"));
  if (!selectedDate) {
    return NextResponse.json({ error: "date is required." }, { status: 400 });
  }
  let durationMinutesForAvailability = Number.isFinite(durationQueryFallback)
    ? Math.max(30, durationQueryFallback)
    : 120;
  if (serviceRaw) {
    const { service, serviceType } = parsePricingServiceParams(serviceRaw);
    durationMinutesForAvailability = Math.max(
      30,
      Math.round(
        quoteJobDurationHours(
          { service, serviceType, rooms: bedrooms, bathrooms, extraRooms, extras },
          vipTier,
        ) * 60,
      ),
    );
  }

  try {
    const slots = await getAvailableTimeSlots(admin, {
      selectedDate,
      durationMinutes: durationMinutesForAvailability,
      userLat: Number.isFinite(latRaw) ? latRaw : null,
      userLng: Number.isFinite(lngRaw) ? lngRaw : null,
      startHour: 7,
      endHour: 18,
      stepMinutes: 30,
    });

    const enriched: TimeSlotWithPricing[] = serviceRaw
      ? slots.map((s) => {
          if (!s.available) {
            return { ...s };
          }
          const { service, serviceType } = parsePricingServiceParams(serviceRaw);
          const q = quoteCheckoutZar(
            {
              service,
              serviceType,
              rooms: bedrooms,
              bathrooms,
              extraRooms,
              extras,
            },
            s.time,
            vipTier,
            { cleanersCount: Math.max(0, Math.round(s.cleanersCount)) },
          );
          return {
            ...s,
            price: q.totalZar,
            duration: q.hours,
            surgeMultiplier: q.effectiveSurgeMultiplier,
            surgeApplied: q.effectiveSurgeMultiplier > 1.001,
          };
        })
      : slots;

    return NextResponse.json({ slots: enriched });
  } catch (error) {
    console.error("[api/booking/time-slots] unexpected error:", error);
    // Never block the booking flow with 500 — client shows empty state.
    return NextResponse.json({ slots: [] as TimeSlotWithPricing[] });
  }
}
