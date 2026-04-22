import { NextResponse } from "next/server";
import { getAvailableCleaners } from "@/lib/booking/availabilityEngine";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  const url = new URL(request.url);
  const selectedDate = url.searchParams.get("date") ?? "";
  const selectedTime = url.searchParams.get("time") ?? "";
  const userLatRaw = url.searchParams.get("lat");
  const userLngRaw = url.searchParams.get("lng");
  if (!selectedDate || !selectedTime) {
    return NextResponse.json({ error: "date and time are required." }, { status: 400 });
  }
  const userLat = userLatRaw ? Number(userLatRaw) : null;
  const userLng = userLngRaw ? Number(userLngRaw) : null;
  try {
    const cleaners = await getAvailableCleaners(admin, {
      userLat: Number.isFinite(userLat) ? userLat : null,
      userLng: Number.isFinite(userLng) ? userLng : null,
      selectedDate,
      selectedTime,
      durationMinutes: 120,
      limit: 5,
    });
    return NextResponse.json({ cleaners });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch cleaners." },
      { status: 500 },
    );
  }
}
