import {
  companyProfitCents,
  resolvedRevenueCents,
  type FinancialBookingInput,
} from "@/lib/admin/computeFinancialDashboard";

/**
 * Rows accepted by the insights engine — **completed** bookings expected;
 * `generateInsights` also filters `status` defensively.
 */
export type InsightBookingRow = FinancialBookingInput & {
  service?: string | null;
};

export type BusinessInsightType =
  | "LOW_MARGIN_LOCATION"
  | "HIGH_MARGIN_LOCATION"
  | "LOW_PROFIT_SERVICE"
  | "TOP_CLEANER"
  | "LOW_SERVICE_FEE";

export type BusinessInsight = {
  type: BusinessInsightType;
  message: string;
  suggestion: string;
  location?: string;
  service?: string;
  cleaner_id?: string;
  cleaner_name?: string;
};

const MIN_JOBS_LOCATION = 3;
const MIN_JOBS_SERVICE = 3;
const TOP_CLEANER_MIN_JOBS = 20;

function isCompleted(status: string | null | undefined): boolean {
  return String(status ?? "").toLowerCase() === "completed";
}

function locationKey(b: InsightBookingRow): string {
  const t = (b.location ?? "").trim();
  return t.length > 0 ? t : "Unknown";
}

function serviceKey(b: InsightBookingRow): string {
  const t = (b.service ?? "").trim();
  return t.length > 0 ? t : "Unknown";
}

function groupBy<T>(items: T[], keyFn: (t: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const k = keyFn(item);
    const arr = map.get(k);
    if (arr) arr.push(item);
    else map.set(k, [item]);
  }
  return map;
}

function sortInsightsStable(a: BusinessInsight, b: BusinessInsight): number {
  const order: Record<BusinessInsightType, number> = {
    LOW_MARGIN_LOCATION: 0,
    HIGH_MARGIN_LOCATION: 1,
    LOW_PROFIT_SERVICE: 2,
    LOW_SERVICE_FEE: 3,
    TOP_CLEANER: 4,
  };
  const ta = order[a.type];
  const tb = order[b.type];
  if (ta !== tb) return ta - tb;
  const ka = a.location ?? a.service ?? a.cleaner_name ?? a.cleaner_id ?? "";
  const kb = b.location ?? b.service ?? b.cleaner_name ?? b.cleaner_id ?? "";
  return ka.localeCompare(kb);
}

/**
 * Deterministic, read-only business insights from stored booking fields.
 * Does not call external AI and does not mutate data.
 */
export function generateInsights(
  bookings: InsightBookingRow[],
  cleanerNames: Record<string, string> = {},
): BusinessInsight[] {
  const completed = bookings.filter((b) => isCompleted(b.status));
  const insights: BusinessInsight[] = [];

  const byLocation = groupBy(completed, locationKey);
  const locKeys = [...byLocation.keys()].sort((x, y) => x.localeCompare(y));
  for (const location of locKeys) {
    const items = byLocation.get(location) ?? [];
    if (items.length < MIN_JOBS_LOCATION) continue;

    let revenueCents = 0;
    let profitCents = 0;
    for (const b of items) {
      revenueCents += resolvedRevenueCents(b);
      profitCents += companyProfitCents(b);
    }
    if (revenueCents <= 0) continue;

    const avgMargin = profitCents / revenueCents;

    if (avgMargin < 0.15) {
      insights.push({
        type: "LOW_MARGIN_LOCATION",
        location,
        message: `${location} has low portfolio margin (${(avgMargin * 100).toFixed(1)}% on ${items.length} completed jobs).`,
        suggestion: "Review pricing or raise service fee roughly 10–15% for this area, or reduce discounts in low-yield slots.",
      });
    } else if (avgMargin > 0.35) {
      insights.push({
        type: "HIGH_MARGIN_LOCATION",
        location,
        message: `${location} is highly profitable (avg margin ${(avgMargin * 100).toFixed(1)}% across ${items.length} jobs).`,
        suggestion: "Consider selective cleaner payout increases or marketing push here to defend share without eroding margin.",
      });
    }
  }

  const byService = groupBy(completed, serviceKey);
  const svcKeys = [...byService.keys()].sort((x, y) => x.localeCompare(y));
  for (const service of svcKeys) {
    const items = byService.get(service) ?? [];
    if (items.length < MIN_JOBS_SERVICE) continue;

    let sumProfitCents = 0;
    for (const b of items) sumProfitCents += companyProfitCents(b);
    const avgProfitZar = sumProfitCents / items.length / 100;

    if (avgProfitZar < 50) {
      insights.push({
        type: "LOW_PROFIT_SERVICE",
        service,
        message: `${service} averages R${avgProfitZar.toFixed(0)} company profit per completed job (${items.length} jobs).`,
        suggestion: "Raise minimum quote, tighten surcharges on heavy variants, or increase the service fee on this SKU.",
      });
    }
  }

  const byCleaner = groupBy(
    completed.filter((b) => (b.cleaner_id != null ? String(b.cleaner_id).trim() : "").length > 0),
    (b) => String(b.cleaner_id).trim(),
  );
  const cleanerIds = [...byCleaner.keys()].sort((x, y) => x.localeCompare(y));
  for (const cleaner_id of cleanerIds) {
    const jobs = byCleaner.get(cleaner_id) ?? [];
    if (jobs.length > TOP_CLEANER_MIN_JOBS) {
      const cleaner_name = cleanerNames[cleaner_id] ?? cleaner_id;
      insights.push({
        type: "TOP_CLEANER",
        cleaner_id,
        cleaner_name,
        message: `${cleaner_name} completed ${jobs.length} jobs in the analyzed window.`,
        suggestion: "Prioritise retention: bonus structure, preferred routes, or faster payout cycles.",
      });
    }
  }

  if (completed.length > 0) {
    let feeSumCents = 0;
    let feeCount = 0;
    for (const b of completed) {
      const sf = Number(b.service_fee_cents);
      if (Number.isFinite(sf) && sf >= 0) {
        feeSumCents += sf;
        feeCount += 1;
      }
    }
    if (feeCount > 0) {
      const avgFeeZar = feeSumCents / feeCount / 100;
      if (avgFeeZar < 25) {
        insights.push({
          type: "LOW_SERVICE_FEE",
          message: `Average service fee is R${avgFeeZar.toFixed(0)} across ${feeCount} completed bookings with a fee recorded.`,
          suggestion: "Benchmark toward R30–R40 where the market allows, especially on high-labour or peak slots.",
        });
      }
    }
  }

  insights.sort(sortInsightsStable);
  return insights;
}

export function businessInsightKey(i: BusinessInsight, index: number): string {
  const part =
    i.type +
    (i.location ? `-${i.location}` : "") +
    (i.service ? `-${i.service}` : "") +
    (i.cleaner_id ? `-${i.cleaner_id}` : "");
  return `${part}-${index}`;
}
