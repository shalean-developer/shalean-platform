/**
 * Financial dashboard aggregates — **completed** bookings only, stored cents/ZAR fields (no payout recomputation).
 */

export type FinancialBookingInput = {
  id: string;
  total_paid_zar: number | null;
  amount_paid_cents?: number | null;
  cleaner_payout_cents: number | null;
  cleaner_bonus_cents?: number | null;
  company_revenue_cents: number | null;
  service_fee_cents?: number | null;
  location: string | null;
  cleaner_id: string | null;
  created_at: string | null;
  status?: string | null;
};

export function resolvedRevenueCents(b: FinancialBookingInput): number {
  const z = Number(b.total_paid_zar);
  if (Number.isFinite(z) && z > 0) return Math.max(0, Math.round(z * 100));
  const ac = Number(b.amount_paid_cents);
  if (Number.isFinite(ac) && ac > 0) return Math.max(0, Math.round(ac));
  return 0;
}

export function companyProfitCents(b: FinancialBookingInput): number {
  const c = Number(b.company_revenue_cents);
  return Number.isFinite(c) && c >= 0 ? Math.round(c) : 0;
}

export function marginRatio(b: FinancialBookingInput): number | null {
  const rev = resolvedRevenueCents(b);
  if (rev <= 0) return null;
  const prof = companyProfitCents(b);
  return prof / rev;
}

export type FinancialKpis = {
  totalRevenueCents: number;
  totalProfitCents: number;
  avgMarginPercent: number | null;
  totalJobs: number;
  totalServiceFeeCents: number;
  totalCleanerPayoutCents: number;
};

export type DailyTrendPoint = {
  day: string;
  revenue: number;
  profit: number;
  jobs: number;
};

export type CleanerLeaderRow = {
  cleaner_id: string;
  cleaner_name: string;
  jobs_completed: number;
  total_earned_cents: number;
  avg_job_earned_cents: number;
};

export type LocationRow = {
  location: string;
  total_jobs: number;
  revenue_cents: number;
  profit_cents: number;
  margin_percent: number | null;
};

export type LowMarginBookingRow = {
  id: string;
  total_paid_zar: number | null;
  revenue_cents: number;
  profit_cents: number;
  margin_percent: number | null;
  location: string | null;
  cleaner_id: string | null;
  cleaner_name: string | null;
  created_at: string | null;
  insight: string;
};

export type FinancialDashboardPayload = {
  kpis: FinancialKpis;
  dailyTrend: DailyTrendPoint[];
  cleaners: CleanerLeaderRow[];
  locations: LocationRow[];
  lowMargin: LowMarginBookingRow[];
  insights: string[];
};

function ymdFromCreatedAt(iso: string | null | undefined): string {
  if (!iso || typeof iso !== "string") return "unknown";
  return iso.slice(0, 10);
}

export function computeFinancialDashboard(
  rows: FinancialBookingInput[],
  cleanerNames: Record<string, string>,
): FinancialDashboardPayload {
  const completed = rows.filter((r) => String(r.status ?? "").toLowerCase() === "completed");

  let totalRevenueCents = 0;
  let totalProfitCents = 0;
  let totalServiceFeeCents = 0;
  let totalCleanerPayoutCents = 0;

  const byDay = new Map<string, { revenue: number; profit: number; jobs: number }>();
  const byCleaner = new Map<
    string,
    { jobs: number; earned: number; profit: number; revenue: number }
  >();
  const byLocation = new Map<string, { jobs: number; revenue: number; profit: number }>();
  const lowMargin: LowMarginBookingRow[] = [];

  for (const b of completed) {
    const rev = resolvedRevenueCents(b);
    const prof = companyProfitCents(b);
    const sf = Number(b.service_fee_cents);
    const cp = Number(b.cleaner_payout_cents);
    const cb = Number(b.cleaner_bonus_cents);
    const cleanerEarned = (Number.isFinite(cp) && cp > 0 ? Math.round(cp) : 0) + (Number.isFinite(cb) && cb > 0 ? Math.round(cb) : 0);

    totalRevenueCents += rev;
    totalProfitCents += prof;
    if (Number.isFinite(sf) && sf > 0) totalServiceFeeCents += Math.round(sf);
    if (cleanerEarned > 0) totalCleanerPayoutCents += cleanerEarned;

    const day = ymdFromCreatedAt(b.created_at);
    const d = byDay.get(day) ?? { revenue: 0, profit: 0, jobs: 0 };
    d.revenue += rev / 100;
    d.profit += prof / 100;
    d.jobs += 1;
    byDay.set(day, d);

    const cid = b.cleaner_id != null ? String(b.cleaner_id).trim() : "";
    if (cid) {
      const c = byCleaner.get(cid) ?? { jobs: 0, earned: 0, profit: 0, revenue: 0 };
      c.jobs += 1;
      c.earned += cleanerEarned;
      c.profit += prof;
      c.revenue += rev;
      byCleaner.set(cid, c);
    }

    const locKey = (b.location ?? "").trim() || "Unknown";
    const L = byLocation.get(locKey) ?? { jobs: 0, revenue: 0, profit: 0 };
    L.jobs += 1;
    L.revenue += rev;
    L.profit += prof;
    byLocation.set(locKey, L);

    const m = marginRatio(b);
    if (m != null && m < 0.15) {
      const cleanerKey = cid || "";
      lowMargin.push({
        id: b.id,
        total_paid_zar: b.total_paid_zar,
        revenue_cents: rev,
        profit_cents: prof,
        margin_percent: m * 100,
        location: b.location,
        cleaner_id: b.cleaner_id,
        cleaner_name: cleanerKey ? cleanerNames[cleanerKey] ?? null : null,
        created_at: b.created_at,
        insight:
          m < 0.05
            ? "Critical: consider repricing or fee for this segment."
            : "Low profit — review service fee, surge, or payout mix.",
      });
    }
  }

  lowMargin.sort((a, b) => (a.margin_percent ?? 0) - (b.margin_percent ?? 0));

  const totalJobs = completed.length;
  const avgMarginPercent =
    totalRevenueCents > 0 ? Math.round((totalProfitCents / totalRevenueCents) * 10000) / 100 : null;

  const dailyTrend = [...byDay.entries()]
    .map(([day, v]) => ({ day, revenue: Math.round(v.revenue * 100) / 100, profit: Math.round(v.profit * 100) / 100, jobs: v.jobs }))
    .sort((a, b) => a.day.localeCompare(b.day));

  const cleaners: CleanerLeaderRow[] = [...byCleaner.entries()]
    .map(([cleaner_id, v]) => ({
      cleaner_id,
      cleaner_name: cleanerNames[cleaner_id] ?? cleaner_id,
      jobs_completed: v.jobs,
      total_earned_cents: v.earned,
      avg_job_earned_cents: v.jobs > 0 ? Math.round(v.earned / v.jobs) : 0,
    }))
    .sort((a, b) => b.total_earned_cents - a.total_earned_cents);

  const locations: LocationRow[] = [...byLocation.entries()]
    .map(([location, v]) => ({
      location,
      total_jobs: v.jobs,
      revenue_cents: v.revenue,
      profit_cents: v.profit,
      margin_percent: v.revenue > 0 ? Math.round((v.profit / v.revenue) * 10000) / 100 : null,
    }))
    .sort((a, b) => b.revenue_cents - a.revenue_cents);

  const insights: string[] = [];
  if (avgMarginPercent != null && avgMarginPercent < 15) {
    insights.push(`Portfolio margin is ${avgMarginPercent}% — below 15% target; review fees and low-demand slots.`);
  }
  if (lowMargin.length >= 5) {
    insights.push(`${lowMargin.length} completed bookings are under 15% margin — inspect location/service mix.`);
  }
  const topLoc = locations[0];
  if (topLoc && topLoc.total_jobs > 0) {
    insights.push(`Top revenue location: ${topLoc.location} (${topLoc.total_jobs} jobs).`);
  }
  const topCl = cleaners[0];
  if (topCl && topCl.jobs_completed > 0) {
    insights.push(`Top earner: ${topCl.cleaner_name} (${topCl.jobs_completed} jobs).`);
  }

  return {
    kpis: {
      totalRevenueCents,
      totalProfitCents,
      avgMarginPercent,
      totalJobs,
      totalServiceFeeCents,
      totalCleanerPayoutCents,
    },
    dailyTrend,
    cleaners,
    locations,
    lowMargin: lowMargin.slice(0, 100),
    insights,
  };
}
