import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export type PerformanceComponent = {
  score: number | null;
  weight: number;
  evidenceCount: number;
  label: string;
};

export type CleanerPerformanceScorecard = {
  cleanerId: string;
  cleanerName: string;
  status: string | null;
  overallScore: number | null;
  grade: "A" | "B" | "C" | "D" | "Needs evidence";
  evidenceCoverage: number;
  period: { from: string; to: string };
  components: {
    quality: PerformanceComponent;
    customerFeedback: PerformanceComponent;
    reliability: PerformanceComponent;
    completion: PerformanceComponent;
    attendance: PerformanceComponent;
  };
  complaints: {
    qualityRelatedCases: number;
    openQualityCases: number;
    penalty: number;
  };
  facts: {
    rosterAssignments: number;
    completedBookings: number;
    reviews: number;
    qaInspections: number;
    attendanceObservations: number;
    totalOffers: number;
    acceptedOffers: number;
  };
};

const WEIGHTS = {
  quality: 30,
  customerFeedback: 25,
  reliability: 20,
  completion: 15,
  attendance: 10,
} as const;

const QUALITY_CASE_CATEGORIES = new Set([
  "complaint",
  "service_quality",
  "quality",
  "damage",
  "missed_service",
  "cleaning_quality",
]);

function clamp(v: number): number {
  return Math.max(0, Math.min(100, Math.round(v)));
}

function mean(values: number[]): number | null {
  if (!values.length) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function gradeFor(score: number | null): CleanerPerformanceScorecard["grade"] {
  if (score == null) return "Needs evidence";
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  return "D";
}

function weightedScore(
  components: Array<{ score: number | null; weight: number }>,
  penalty: number,
): { overall: number | null; coverage: number } {
  const available = components.filter((c) => c.score != null);
  const availableWeight = available.reduce((sum, c) => sum + c.weight, 0);
  const totalWeight = components.reduce((sum, c) => sum + c.weight, 0);
  if (!availableWeight) return { overall: null, coverage: 0 };
  const base = available.reduce((sum, c) => sum + (c.score as number) * c.weight, 0) / availableWeight;
  return {
    overall: clamp(base - penalty),
    coverage: clamp((availableWeight / totalWeight) * 100),
  };
}

function scheduledStartIso(date: string | null, time: string | null): number | null {
  const d = String(date ?? "").trim();
  const t = String(time ?? "").trim().slice(0, 5);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || !/^\d{2}:\d{2}$/.test(t)) return null;
  const ms = Date.parse(`${d}T${t}:00+02:00`);
  return Number.isFinite(ms) ? ms : null;
}

function normalizedRate(value: number | null | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return clamp(value <= 1 ? value * 100 : value);
}

export async function loadCleanerPerformanceScorecards(
  admin: SupabaseClient,
  input?: { cleanerId?: string | null; days?: number },
): Promise<{ scorecards: CleanerPerformanceScorecard[]; from: string; to: string }> {
  const days = Math.max(30, Math.min(365, Math.round(input?.days ?? 90)));
  const toDate = new Date();
  const fromDate = new Date(toDate.getTime() - days * 86_400_000);
  const toIso = toDate.toISOString();
  const fromIso = fromDate.toISOString();
  const fromYmd = fromIso.slice(0, 10);
  const toYmd = toIso.slice(0, 10);

  let cleanerQuery = admin
    .from("cleaners")
    .select("id, full_name, status, is_active, total_offers, accepted_offers, acceptance_rate, acceptance_rate_recent")
    .order("full_name", { ascending: true });
  if (input?.cleanerId) cleanerQuery = cleanerQuery.eq("id", input.cleanerId);
  const { data: cleanerRows, error: cleanerError } = await cleanerQuery;
  if (cleanerError) throw new Error(cleanerError.message);

  const cleaners = (cleanerRows ?? []) as Array<{
    id: string;
    full_name: string | null;
    status: string | null;
    is_active: boolean | null;
    total_offers: number | null;
    accepted_offers: number | null;
    acceptance_rate: number | null;
    acceptance_rate_recent: number | null;
  }>;
  const cleanerIds = cleaners.map((c) => c.id);
  if (!cleanerIds.length) return { scorecards: [], from: fromIso, to: toIso };

  const { data: rosterRows, error: rosterError } = await admin
    .from("booking_cleaners")
    .select("booking_id, cleaner_id, completed_at, assigned_at")
    .in("cleaner_id", cleanerIds);
  if (rosterError) throw new Error(rosterError.message);
  const roster = (rosterRows ?? []) as Array<{
    booking_id: string;
    cleaner_id: string;
    completed_at: string | null;
    assigned_at: string | null;
  }>;
  const allBookingIds = [...new Set(roster.map((r) => r.booking_id))];

  const bookings: Array<{
    id: string;
    status: string | null;
    date: string | null;
    time: string | null;
    started_at: string | null;
    completed_at: string | null;
    is_test: boolean | null;
  }> = [];
  for (let i = 0; i < allBookingIds.length; i += 300) {
    const ids = allBookingIds.slice(i, i + 300);
    const { data, error } = await admin
      .from("bookings")
      .select("id, status, date, time, started_at, completed_at, is_test")
      .in("id", ids)
      .gte("date", fromYmd)
      .lte("date", toYmd);
    if (error) throw new Error(error.message);
    bookings.push(...((data ?? []) as typeof bookings));
  }
  const bookingById = new Map(bookings.filter((b) => b.is_test !== true).map((b) => [b.id, b]));
  const periodBookingIds = [...bookingById.keys()];

  const [reviewsResult, qaResult, casesResult] = await Promise.all([
    admin
      .from("reviews")
      .select("cleaner_id, rating, created_at")
      .in("cleaner_id", cleanerIds)
      .gte("created_at", fromIso)
      .lte("created_at", toIso),
    periodBookingIds.length
      ? admin
          .from("quality_inspections")
          .select("booking_id, overall_score, status, signed_off_at, created_at")
          .in("booking_id", periodBookingIds)
          .in("status", ["passed", "rework_required", "failed", "closed"])
      : Promise.resolve({ data: [], error: null }),
    periodBookingIds.length
      ? admin
          .from("customer_care_cases")
          .select("booking_id, category, status, created_at")
          .in("booking_id", periodBookingIds)
          .gte("created_at", fromIso)
          .lte("created_at", toIso)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (reviewsResult.error) throw new Error(reviewsResult.error.message);
  if (qaResult.error) throw new Error(qaResult.error.message);
  if (casesResult.error) throw new Error(casesResult.error.message);

  const reviews = (reviewsResult.data ?? []) as Array<{ cleaner_id: string; rating: number; created_at: string }>;
  const inspections = (qaResult.data ?? []) as Array<{
    booking_id: string;
    overall_score: number | null;
    status: string;
    signed_off_at: string | null;
    created_at: string;
  }>;
  const cases = (casesResult.data ?? []) as Array<{
    booking_id: string | null;
    category: string;
    status: string;
    created_at: string;
  }>;

  const bookingToCleaners = new Map<string, Set<string>>();
  for (const r of roster) {
    if (!bookingById.has(r.booking_id)) continue;
    const set = bookingToCleaners.get(r.booking_id) ?? new Set<string>();
    set.add(r.cleaner_id);
    bookingToCleaners.set(r.booking_id, set);
  }

  const cards = cleaners.map((cleaner): CleanerPerformanceScorecard => {
    const myRoster = roster.filter((r) => r.cleaner_id === cleaner.id && bookingById.has(r.booking_id));
    const myBookings = myRoster.map((r) => bookingById.get(r.booking_id)).filter(Boolean) as typeof bookings;
    const completed = myBookings.filter((b) => String(b.status).toLowerCase() === "completed");
    const eligibleCompletion = myBookings.filter((b) => ["completed", "assigned"].includes(String(b.status).toLowerCase()));
    const completionScore = eligibleCompletion.length ? clamp((completed.length / eligibleCompletion.length) * 100) : null;

    const myReviews = reviews.filter((r) => r.cleaner_id === cleaner.id);
    const avgRating = mean(myReviews.map((r) => Number(r.rating)).filter(Number.isFinite));
    const feedbackScore = avgRating == null ? null : clamp((avgRating / 5) * 100);

    const myInspectionScores: number[] = [];
    for (const inspection of inspections) {
      if (inspection.overall_score == null) continue;
      if (bookingToCleaners.get(inspection.booking_id)?.has(cleaner.id)) {
        myInspectionScores.push(Number(inspection.overall_score));
      }
    }
    const qualityAvg = mean(myInspectionScores);
    const qualityScore = qualityAvg == null ? null : clamp(qualityAvg);

    const totalOffers = Math.max(0, Number(cleaner.total_offers ?? 0));
    const acceptedOffers = Math.max(0, Number(cleaner.accepted_offers ?? 0));
    let reliabilityScore = normalizedRate(cleaner.acceptance_rate_recent);
    if (reliabilityScore == null) reliabilityScore = normalizedRate(cleaner.acceptance_rate);
    if (reliabilityScore == null && totalOffers > 0) reliabilityScore = clamp((acceptedOffers / totalOffers) * 100);

    let attendanceObserved = 0;
    let onTime = 0;
    for (const b of myBookings) {
      if (!b.started_at) continue;
      const scheduled = scheduledStartIso(b.date, b.time);
      const actual = Date.parse(b.started_at);
      if (scheduled == null || !Number.isFinite(actual)) continue;
      attendanceObserved += 1;
      if (actual <= scheduled + 15 * 60_000) onTime += 1;
    }
    const attendanceScore = attendanceObserved ? clamp((onTime / attendanceObserved) * 100) : null;

    let qualityRelatedCases = 0;
    let openQualityCases = 0;
    for (const c of cases) {
      if (!c.booking_id || !bookingToCleaners.get(c.booking_id)?.has(cleaner.id)) continue;
      if (!QUALITY_CASE_CATEGORIES.has(String(c.category ?? "").trim().toLowerCase())) continue;
      qualityRelatedCases += 1;
      if (!["resolved", "closed"].includes(String(c.status ?? "").toLowerCase())) openQualityCases += 1;
    }
    const complaintPenalty = Math.min(20, qualityRelatedCases * 4 + openQualityCases * 4);

    const components = {
      quality: { score: qualityScore, weight: WEIGHTS.quality, evidenceCount: myInspectionScores.length, label: "QA inspections" },
      customerFeedback: { score: feedbackScore, weight: WEIGHTS.customerFeedback, evidenceCount: myReviews.length, label: "Customer reviews" },
      reliability: { score: reliabilityScore, weight: WEIGHTS.reliability, evidenceCount: totalOffers, label: "Offer reliability" },
      completion: { score: completionScore, weight: WEIGHTS.completion, evidenceCount: eligibleCompletion.length, label: "Assigned-job completion" },
      attendance: { score: attendanceScore, weight: WEIGHTS.attendance, evidenceCount: attendanceObserved, label: "On-time start evidence" },
    };
    const weighted = weightedScore(Object.values(components), complaintPenalty);

    return {
      cleanerId: cleaner.id,
      cleanerName: String(cleaner.full_name ?? "Cleaner").trim() || "Cleaner",
      status: cleaner.status ?? null,
      overallScore: weighted.overall,
      grade: gradeFor(weighted.overall),
      evidenceCoverage: weighted.coverage,
      period: { from: fromIso, to: toIso },
      components,
      complaints: { qualityRelatedCases, openQualityCases, penalty: complaintPenalty },
      facts: {
        rosterAssignments: myRoster.length,
        completedBookings: completed.length,
        reviews: myReviews.length,
        qaInspections: myInspectionScores.length,
        attendanceObservations: attendanceObserved,
        totalOffers,
        acceptedOffers,
      },
    };
  });

  cards.sort((a, b) => {
    if (a.overallScore == null && b.overallScore == null) return a.cleanerName.localeCompare(b.cleanerName);
    if (a.overallScore == null) return 1;
    if (b.overallScore == null) return -1;
    return b.overallScore - a.overallScore || a.cleanerName.localeCompare(b.cleanerName);
  });

  return { scorecards: cards, from: fromIso, to: toIso };
}
