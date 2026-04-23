import { NextResponse } from "next/server";
import { getAvailableTimeSlots } from "@/lib/booking/availabilityEngine";
import { normalizeVipTier } from "@/lib/pricing/vipTier";
import {
  normalizeExtraRoomsRaw,
  parsePricingServiceParams,
} from "@/lib/pricing/pricingEngine";
import { quoteJobDurationHoursWithSnapshot } from "@/lib/pricing/pricingEngineSnapshot";
import { buildPricingRatesSnapshotFromDb } from "@/lib/pricing/buildPricingRatesSnapshotFromDb";
import { filterExtrasForSnapshot } from "@/lib/pricing/pricingEngineSnapshot";
import { resolveServiceForPricing } from "@/lib/pricing/pricingEngine";
import { getSupabaseAdmin, supabaseAdminNotConfiguredBody } from "@/lib/supabase/admin";

/** Availability-only row — pricing runs on the client (`calculateBookingPrice` + catalog snapshot). */
export type TimeSlotAvailability = {
  time: string;
  available: boolean;
  cleanersCount: number;
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
  const durationParam = url.searchParams.get("duration");
  const latRaw = Number(url.searchParams.get("lat"));
  const lngRaw = Number(url.searchParams.get("lng"));

  if (!selectedDate) {
    return NextResponse.json({ error: "date is required." }, { status: 400 });
  }

  const durationParsed = Number(durationParam);
  let durationMinutes = Number.isFinite(durationParsed) ? Math.max(30, Math.round(durationParsed)) : 120;

  /** Legacy callers that omit `duration` — infer job length once, without attaching ZAR to slots. */
  if (!Number.isFinite(durationParsed) || durationParsed <= 0) {
    const serviceRaw = (url.searchParams.get("serviceType") ?? "").trim();
    if (serviceRaw) {
      const bedroomsRaw = Number(url.searchParams.get("bedrooms") ?? 1);
      const bathroomsRaw = Number(url.searchParams.get("bathrooms") ?? 1);
      const bedrooms = Number.isFinite(bedroomsRaw) ? Math.max(1, Math.round(bedroomsRaw)) : 1;
      const bathrooms = Number.isFinite(bathroomsRaw) ? Math.max(1, Math.round(bathroomsRaw)) : 1;
      const extraRooms = normalizeExtraRoomsRaw(url.searchParams.get("extraRooms"));
      const extras = parseExtrasParam(url.searchParams.get("extras"));
      const vipTier = normalizeVipTier(url.searchParams.get("vipTier"));
      const { service, serviceType } = parsePricingServiceParams(serviceRaw);
      const snapshot = await buildPricingRatesSnapshotFromDb(admin);
      if (snapshot) {
        const draft = { service, serviceType, rooms: bedrooms, bathrooms, extraRooms, extras: [] as string[] };
        const resolved = resolveServiceForPricing(draft);
        const job = {
          ...draft,
          extras: filterExtrasForSnapshot(snapshot, extras, resolved),
        };
        durationMinutes = Math.max(
          30,
          Math.round(quoteJobDurationHoursWithSnapshot(snapshot, job, vipTier) * 60),
        );
      }
    }
  }

  try {
    const slots = await getAvailableTimeSlots(admin, {
      selectedDate,
      durationMinutes,
      userLat: Number.isFinite(latRaw) ? latRaw : null,
      userLng: Number.isFinite(lngRaw) ? lngRaw : null,
      startHour: 7,
      endHour: 18,
      stepMinutes: 30,
    });

    return NextResponse.json({ slots });
  } catch (error) {
    console.error("[api/booking/time-slots] unexpected error:", error);
    return NextResponse.json({ slots: [] as TimeSlotAvailability[] });
  }
}
