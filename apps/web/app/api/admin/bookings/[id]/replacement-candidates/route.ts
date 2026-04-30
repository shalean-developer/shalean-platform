import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth/admin";
import {
  bookingDemandWindowMinutes,
  cleanerOverlapsDemandSlot,
  loadCleanerDayScheduleOthers,
} from "@/lib/admin/replacementCandidateOverlaps";
import {
  compositeReplacementScore,
  distanceScoreFromKm,
  haversineDistanceKm,
  labelFromCleanerState,
  ratingSubscore,
  reliabilityScoreFromJobs,
  availabilityScoreFromLabel,
  type AvailabilityLabel,
} from "@/lib/admin/replacementCandidateScoring";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parseUuidList(raw: string | null, max: number): string[] {
  if (!raw?.trim()) return [];
  const parts = raw.split(",").map((s) => s.trim()).filter(Boolean);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const p of parts) {
    if (!UUID_RE.test(p) || seen.has(p)) continue;
    seen.add(p);
    out.push(p);
    if (out.length >= max) break;
  }
  return out;
}

export type ReplacementCandidateDto = {
  cleanerId: string;
  name: string;
  rating: number | null;
  totalJobs: number;
  distanceKm: number | null;
  availability: AvailabilityLabel;
  score: number;
};

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: bookingId } = await ctx.params;
  if (!bookingId) return NextResponse.json({ error: "Missing booking id." }, { status: 400 });

  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "").trim() ?? "";
  if (!token) return NextResponse.json({ error: "Missing authorization." }, { status: 401 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const pub = createClient(url, anon);
  const {
    data: { user },
  } = await pub.auth.getUser(token);
  if (!user?.email || !isAdmin(user.email)) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const reqUrl = new URL(request.url);
  const limit = Math.min(10, Math.max(1, parseInt(reqUrl.searchParams.get("limit") ?? "10", 10) || 10));
  const excludeOne = reqUrl.searchParams.get("excludeCleanerId")?.trim() ?? "";
  const excludeExtra = parseUuidList(reqUrl.searchParams.get("excludeCleanerIds"), 24);
  if (excludeOne && !UUID_RE.test(excludeOne)) {
    return NextResponse.json({ error: "Invalid excludeCleanerId." }, { status: 400 });
  }

  const { data: booking, error: bErr } = await admin
    .from("bookings")
    .select("id, date, time, duration_minutes, city_id, latitude, longitude")
    .eq("id", bookingId)
    .maybeSingle();

  if (bErr || !booking) {
    return NextResponse.json({ error: "Booking not found." }, { status: 404 });
  }

  const b = booking as {
    date?: string | null;
    time?: string | null;
    duration_minutes?: number | null;
    city_id?: string | null;
    latitude?: number | null;
    longitude?: number | null;
  };

  const dateYmd = String(b.date ?? "").trim();
  const timeHm = String(b.time ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateYmd) || !/^\d{2}:\d{2}/.test(timeHm)) {
    return NextResponse.json({ error: "Booking has no valid date/time for slot checks." }, { status: 400 });
  }

  const demand = bookingDemandWindowMinutes(b);
  if (!demand) {
    return NextResponse.json({ error: "Booking has no valid time window." }, { status: 400 });
  }

  const { data: rosterRows } = await admin.from("booking_cleaners").select("cleaner_id").eq("booking_id", bookingId);
  const rosterIds = new Set(
    (rosterRows ?? [])
      .map((r) => String((r as { cleaner_id?: string }).cleaner_id ?? "").trim())
      .filter((id) => UUID_RE.test(id)),
  );
  if (excludeOne) rosterIds.add(excludeOne);
  for (const id of excludeExtra) rosterIds.add(id);

  const othersByCleaner = await loadCleanerDayScheduleOthers(admin, { dateYmd, excludeBookingId: bookingId });

  const jobLat =
    typeof b.latitude === "number" && Number.isFinite(b.latitude) ? b.latitude : null;
  const jobLng =
    typeof b.longitude === "number" && Number.isFinite(b.longitude) ? b.longitude : null;

  let q = admin
    .from("cleaners")
    .select("id, full_name, rating, jobs_completed, is_available, status, latitude, longitude, home_lat, home_lng, city_id")
    .neq("status", "offline")
    .order("rating", { ascending: false, nullsFirst: false })
    .limit(220);

  const cityId = String(b.city_id ?? "").trim();
  if (cityId) {
    q = q.eq("city_id", cityId);
  }

  const { data: cleanerRows, error: cErr } = await q;
  if (cErr) {
    return NextResponse.json({ error: cErr.message }, { status: 500 });
  }

  type CRow = {
    id: string;
    full_name: string | null;
    rating: number | null;
    jobs_completed: number | null;
    is_available: boolean | null;
    status: string | null;
    latitude: number | null;
    longitude: number | null;
    home_lat: number | null;
    home_lng: number | null;
  };

  const candidates: ReplacementCandidateDto[] = [];

  for (const raw of cleanerRows ?? []) {
    const c = raw as CRow;
    const id = String(c.id ?? "").trim();
    if (!id || rosterIds.has(id)) continue;

    const lat = typeof c.latitude === "number" && Number.isFinite(c.latitude) ? c.latitude : c.home_lat;
    const lng = typeof c.longitude === "number" && Number.isFinite(c.longitude) ? c.longitude : c.home_lng;
    const clat = typeof lat === "number" && Number.isFinite(lat) ? lat : null;
    const clng = typeof lng === "number" && Number.isFinite(lng) ? lng : null;

    let distanceKm: number | null = null;
    if (jobLat != null && jobLng != null && clat != null && clng != null) {
      distanceKm = haversineDistanceKm(jobLat, jobLng, clat, clng);
    }

    const slotOverlap = cleanerOverlapsDemandSlot(id, othersByCleaner, demand.startMin, demand.durationMin);
    const availability = labelFromCleanerState({
      status: c.status,
      isAvailable: c.is_available,
      slotOverlap,
    });

    const ratingN = typeof c.rating === "number" && Number.isFinite(c.rating) ? c.rating : null;
    const jobs = typeof c.jobs_completed === "number" && Number.isFinite(c.jobs_completed) ? Math.floor(c.jobs_completed) : 0;

    const ratingPart = ratingSubscore(ratingN);
    const availPart = availabilityScoreFromLabel(availability);
    const distPart = distanceScoreFromKm(distanceKm);
    const relPart = reliabilityScoreFromJobs(jobs);
    const score = compositeReplacementScore({
      rating: ratingPart,
      availability: availPart,
      distance: distPart,
      reliability: relPart,
    });

    candidates.push({
      cleanerId: id,
      name: (c.full_name ?? "").trim() || id,
      rating: ratingN,
      totalJobs: jobs,
      distanceKm: distanceKm != null ? Math.round(distanceKm * 10) / 10 : null,
      availability,
      score,
    });
  }

  candidates.sort((a, b) => b.score - a.score || (a.distanceKm ?? 1e9) - (b.distanceKm ?? 1e9));
  const top = candidates.slice(0, limit);

  return NextResponse.json(top);
}
