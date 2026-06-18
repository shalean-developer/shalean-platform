import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getEligibleCleaners } from "@/lib/booking/getEligibleCleaners";
import { SERVICE_CONFIG } from "@/src/features/booking-v2/config/serviceConfig";
import type { AvailableCleanerV2, CleanerBadge } from "@/src/features/booking-v2/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const AVATAR_COLORS = [
  "bg-rose-100 text-rose-700",
  "bg-amber-100 text-amber-700",
  "bg-emerald-100 text-emerald-700",
  "bg-violet-100 text-violet-700",
  "bg-blue-100 text-blue-700",
  "bg-teal-100 text-teal-700",
  "bg-orange-100 text-orange-700",
  "bg-pink-100 text-pink-700",
];

const SERVICE_SLUG_TO_TYPE: Record<string, string> = {
  "regular-cleaning": "standard",
  "deep-cleaning": "deep",
  "moving-cleaning": "move",
  "office-cleaning": "office",
  "carpet-cleaning": "carpet",
  "airbnb-cleaning": "airbnb",
};

function toInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
}

function classifyBadges(
  idx: number,
  rating: number | null,
  jobsCompleted: number,
  distanceKm: number | null,
): CleanerBadge[] {
  const badges: CleanerBadge[] = [];
  if (idx === 0) badges.push("recommended");
  if ((rating ?? 0) >= 4.8 && jobsCompleted >= 50) badges.push("top_rated");
  if (distanceKm != null && distanceKm < 8) badges.push("nearby");
  if (jobsCompleted < 10) badges.push("new");
  return badges;
}

export async function GET(request: Request) {
  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  }

  const url = new URL(request.url);
  const date = url.searchParams.get("date") ?? "";
  const time = url.searchParams.get("time") ?? "";
  const serviceSlug = url.searchParams.get("serviceSlug") ?? "";
  const durationParam = url.searchParams.get("durationMinutes");

  const serviceType = SERVICE_SLUG_TO_TYPE[serviceSlug] ?? null;

  // Derive duration: from param, or from static service config, fallback to 180 min
  let durationMinutes = durationParam ? parseInt(durationParam, 10) : 0;
  if (!durationMinutes || isNaN(durationMinutes)) {
    const staticConfig = SERVICE_CONFIG[serviceSlug as keyof typeof SERVICE_CONFIG];
    durationMinutes = staticConfig ? Math.round(staticConfig.estimatedDurationHours * 60) : 180;
  }

  const hasDateAndTime =
    /^\d{4}-\d{2}-\d{2}$/.test(date) && /^\d{2}:\d{2}$/.test(time);

  if (hasDateAndTime) {
    let eligibleCleaners;
    try {
      eligibleCleaners = await getEligibleCleaners(admin, {
        date,
        startTime: time,
        durationMinutes,
        locationId: "",
        locationExpandedIds: null,
        serviceType: serviceType ?? undefined,
        enforcePublicDailyWorkloadLimit: true,
        limit: 20,
      });
    } catch {
      return NextResponse.json({ error: "Failed to load cleaners." }, { status: 500 });
    }

    const result: AvailableCleanerV2[] = eligibleCleaners.map((c, idx) => {
      const name = c.full_name ?? "Cleaner";
      return {
        id: c.id,
        name,
        initials: toInitials(name),
        avatarColor: AVATAR_COLORS[idx % AVATAR_COLORS.length],
        rating: c.rating,
        jobsCompleted: c.jobs_completed,
        areasServed: null,
        isAvailable: true,
        slotEligible: true,
        badges: classifyBadges(idx, c.rating, c.jobs_completed, c.distance_km ?? null),
        unavailableReason: null,
      };
    });

    return NextResponse.json({ cleaners: result });
  }

  // Graceful fallback: basic list when date/time not yet selected
  const { data: rows, error } = await admin
    .from("cleaners")
    .select("id, full_name, rating, jobs_completed, status, is_available, location")
    .not("status", "in", '("inactive","suspended","rejected","banned")')
    .eq("is_available", true)
    .order("rating", { ascending: false, nullsFirst: false })
    .limit(12);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const result: AvailableCleanerV2[] = (rows ?? []).map((c, idx) => {
    const name = (c.full_name as string | null) ?? "Cleaner";
    const jobsDone = (c.jobs_completed as number | null) ?? 0;
    const rating = (c.rating as number | null) ?? null;
    return {
      id: c.id as string,
      name,
      initials: toInitials(name),
      avatarColor: AVATAR_COLORS[idx % AVATAR_COLORS.length],
      rating,
      jobsCompleted: jobsDone,
      areasServed: (c.location as string | null) ?? null,
      isAvailable: (c.is_available as boolean | null) ?? true,
      slotEligible: false,
      badges: classifyBadges(idx, rating, jobsDone, null),
      unavailableReason: null,
    };
  });

  return NextResponse.json({ cleaners: result });
}
