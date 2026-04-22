import { NextResponse } from "next/server";
import { calculatePrice, getAvailableTimeSlots } from "@/lib/booking/availabilityEngine";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

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

export async function GET(request: Request) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  const url = new URL(request.url);
  const selectedDate = url.searchParams.get("date") ?? "";
  const durationRaw = Number(url.searchParams.get("duration") ?? "120");
  const latRaw = Number(url.searchParams.get("lat"));
  const lngRaw = Number(url.searchParams.get("lng"));
  const serviceType = (url.searchParams.get("serviceType") ?? "").trim();
  const bedrooms = Math.max(1, Number(url.searchParams.get("bedrooms") ?? 1));
  const bathrooms = Math.max(1, Number(url.searchParams.get("bathrooms") ?? 1));
  if (!selectedDate) {
    return NextResponse.json({ error: "date is required." }, { status: 400 });
  }
  try {
    const slots = await getAvailableTimeSlots(admin, {
      selectedDate,
      durationMinutes: Number.isFinite(durationRaw) ? Math.max(30, durationRaw) : 120,
      userLat: Number.isFinite(latRaw) ? latRaw : null,
      userLng: Number.isFinite(lngRaw) ? lngRaw : null,
      startHour: 7,
      endHour: 18,
      stepMinutes: 30,
    });

    const enriched: TimeSlotWithPricing[] = serviceType
      ? slots.map((s) => {
          if (!s.available) {
            return { ...s };
          }
          const q = calculatePrice({
            serviceType,
            bedrooms,
            bathrooms,
            date: selectedDate,
            time: s.time,
            cleanersCount: Math.max(0, Math.round(s.cleanersCount)),
          });
          return {
            ...s,
            price: q.price,
            duration: q.duration,
            surgeMultiplier: q.surgeMultiplier,
            surgeApplied: q.surgeApplied,
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
