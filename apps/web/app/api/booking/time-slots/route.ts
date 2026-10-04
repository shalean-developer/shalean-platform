import { NextResponse } from "next/server";
import { getAvailableTimeSlots } from "@/lib/booking/availabilityEngine";
import { selectLegacyJobDurationMinutes } from "@/lib/pricing/legacyDurationSelection";
import {
  normalizeExtraRoomsRaw,
  parsePricingServiceParams,
} from "@/lib/pricing/pricingEngine";
import { buildPricingRatesSnapshotFromDb } from "@/lib/pricing/buildPricingRatesSnapshotFromDb";
import { filterExtrasForSnapshot } from "@/lib/pricing/pricingEngineSnapshot";
import { resolveServiceForPricing } from "@/lib/pricing/pricingEngine";
import { getSupabaseAdmin, supabaseAdminNotConfiguredBody } from "@/lib/supabase/admin";

/** Availability-only row — pricing runs on the client (`calculateBookingPrice` + catalog snapshot). */
export type TimeSlotAvailability = {
  time: string;
  available: boolean;
  cleanersCount: number;
  /** Area the slot grid was built for — must match `locationId` on lock when both are sent. */
  locationId: string | null;
  availableInstant?: boolean;
  fulfillmentMode?: "instant" | "ops_assignment" | "area_review";
};

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SlotTiming = {
  wave1Ms: number;
  wave2Ms: number;
  evaluationMs: number;
  totalMs: number;
};

function timingHeader(value: number | undefined): string {
  return String(Math.max(0, Math.round(value ?? 0)));
}

function jsonSlots(slots: TimeSlotAvailability[], timing?: SlotTiming) {
  return NextResponse.json(
    { slots },
    {
      headers: {
        "Cache-Control": "private, max-age=20, stale-while-revalidate=40",
        "X-Booking-Slots-Wave1-Ms": timingHeader(timing?.wave1Ms),
        "X-Booking-Slots-Wave2-Ms": timingHeader(timing?.wave2Ms),
        "X-Booking-Slots-Evaluation-Ms": timingHeader(timing?.evaluationMs),
        "X-Booking-Slots-Total-Ms": timingHeader(timing?.totalMs),
      },
    },
  );
}

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
  const locationId = url.searchParams.get("locationId")?.trim() ?? url.searchParams.get("location_id")?.trim() ?? null;
  const latRaw = Number(url.searchParams.get("lat"));
  const lngRaw = Number(url.searchParams.get("lng"));

  if (!selectedDate) {
    return NextResponse.json({ error: "date is required." }, { status: 400 });
  }

  const durationParsed = Number(durationParam);
  let durationMinutes = Number.isFinite(durationParsed) ? Math.max(30, Math.round(durationParsed)) : 120;

  const serviceRaw = (url.searchParams.get("serviceType") ?? url.searchParams.get("service") ?? "").trim();
  let bookingServiceSlug: string | null = null;
  if (serviceRaw) {
    const { service, serviceType } = parsePricingServiceParams(serviceRaw);
    const draft = { service, serviceType, rooms: 1, bathrooms: 1, extraRooms: 0, extras: [] as string[] };
    bookingServiceSlug = resolveServiceForPricing(draft);
  }

  /** Legacy callers that omit `duration` — infer job length once, without attaching ZAR to slots. */
  if (!Number.isFinite(durationParsed) || durationParsed <= 0) {
    if (serviceRaw) {
      const bedroomsRaw = Number(url.searchParams.get("bedrooms") ?? 1);
      const bathroomsRaw = Number(url.searchParams.get("bathrooms") ?? 1);
      const bedrooms = Number.isFinite(bedroomsRaw) ? Math.max(1, Math.round(bedroomsRaw)) : 1;
      const bathrooms = Number.isFinite(bathroomsRaw) ? Math.max(1, Math.round(bathroomsRaw)) : 1;
      const extraRooms = normalizeExtraRoomsRaw(url.searchParams.get("extraRooms"));
      const extras = parseExtrasParam(url.searchParams.get("extras"));
      const { service, serviceType } = parsePricingServiceParams(serviceRaw);
      const snapshot = await buildPricingRatesSnapshotFromDb(admin);
      if (snapshot) {
        const draft = { service, serviceType, rooms: bedrooms, bathrooms, extraRooms, extras: [] as string[] };
        const resolved = resolveServiceForPricing(draft);
        const job = {
          ...draft,
          extras: filterExtrasForSnapshot(snapshot, extras, resolved),
        };
        durationMinutes = selectLegacyJobDurationMinutes(snapshot, job);
      }
    }
  }

  try {
    let timing: SlotTiming | undefined;
    const slots = await getAvailableTimeSlots(admin, {
      selectedDate,
      durationMinutes,
      userLat: Number.isFinite(latRaw) ? latRaw : null,
      userLng: Number.isFinite(lngRaw) ? lngRaw : null,
      startHour: 7,
      endHour: 18,
      stepMinutes: 30,
      locationId,
      bookingServiceSlug,
      onTiming: (measured) => {
        timing = measured;
      },
    });

    console.info("[api/booking/time-slots] timing", {
      date: selectedDate,
      locationId,
      service: bookingServiceSlug,
      slots: slots.length,
      wave1Ms: timingHeader(timing?.wave1Ms),
      wave2Ms: timingHeader(timing?.wave2Ms),
      evaluationMs: timingHeader(timing?.evaluationMs),
      totalMs: timingHeader(timing?.totalMs),
    });
    return jsonSlots(slots, timing);
  } catch (error) {
    console.error("[api/booking/time-slots] unexpected error:", error);
    return jsonSlots([]);
  }
}
