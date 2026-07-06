import {
  MAX_STANDARD_BASE_PAYOUT_CENTS,
  MIN_STANDARD_BASE_PAYOUT_CENTS,
  resolveTenureMonths,
  resolveTenurePercentage,
} from "@/lib/payout/canonicalCleanerPayout";

/** Same threshold as the canonical payout engine. */
export const CLEANER_TENURE_MONTHS_THRESHOLD = 4;

export type CleanerEarningsTier = "junior" | "experienced" | "missing_joined";

export type CleanerTenureSummary = {
  joinedAtIso: string | null;
  tenureMonths: number;
  tier: CleanerEarningsTier;
  payoutPercentage: number;
  payoutRateLabel: string;
  minZar: number;
  maxZar: number;
};

export function resolveCleanerJoinedAtIso(
  joinedAt: string | null | undefined,
  createdAt?: string | null | undefined,
): string | null {
  const joined = String(joinedAt ?? "").trim();
  if (joined) return joined;
  const created = String(createdAt ?? "").trim();
  return created || null;
}

/** Reference instant for “current” tenure in admin lists (today, noon UTC). */
export function adminTenureReferenceIsoUtc(now = new Date()): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}T12:00:00.000Z`;
}

export function cleanerEarningsTierFromJoinedAt(
  joinedAtIso: string | null,
  referenceAppointmentIsoUtc: string,
): CleanerEarningsTier {
  if (!joinedAtIso) return "missing_joined";
  const months = resolveTenureMonths(joinedAtIso, referenceAppointmentIsoUtc);
  return months < CLEANER_TENURE_MONTHS_THRESHOLD ? "junior" : "experienced";
}

export function formatCleanerEarningsTierLabel(tier: CleanerEarningsTier): string {
  if (tier === "junior") return "Junior (60%)";
  if (tier === "experienced") return "Experienced (70%)";
  return "Missing join date";
}

export function cleanerEarningsTierBadgeClass(tier: CleanerEarningsTier): string {
  if (tier === "junior") return "bg-amber-100 text-amber-900";
  if (tier === "experienced") return "bg-emerald-100 text-emerald-900";
  return "bg-rose-100 text-rose-900";
}

export function formatCleanerPayoutRateLabel(percentage: number): string {
  return `${Math.round(percentage * 100)}%`;
}

export function cleanerTenureSummary(params: {
  joined_at?: string | null;
  created_at?: string | null;
  referenceAppointmentIsoUtc?: string;
}): CleanerTenureSummary {
  const joinedAtIso = resolveCleanerJoinedAtIso(params.joined_at, params.created_at);
  const reference = params.referenceAppointmentIsoUtc ?? adminTenureReferenceIsoUtc();
  const tier = cleanerEarningsTierFromJoinedAt(joinedAtIso, reference);
  const tenureMonths = joinedAtIso ? resolveTenureMonths(joinedAtIso, reference) : 0;
  const payoutPercentage =
    tier === "missing_joined" ? resolveTenurePercentage(0) : resolveTenurePercentage(tenureMonths);

  return {
    joinedAtIso,
    tenureMonths,
    tier,
    payoutPercentage,
    payoutRateLabel: formatCleanerPayoutRateLabel(payoutPercentage),
    minZar: MIN_STANDARD_BASE_PAYOUT_CENTS / 100,
    maxZar: MAX_STANDARD_BASE_PAYOUT_CENTS / 100,
  };
}

/** Parse admin date input (`YYYY-MM-DD` or ISO) into a stored `joined_at` value. */
export function parseAdminJoinedAtInput(raw: string): string | null {
  const t = String(raw ?? "").trim();
  if (!t) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return `${t}T00:00:00.000Z`;
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export function formatJoinedAtForAdminInput(joinedAtIso: string | null | undefined): string {
  const t = String(joinedAtIso ?? "").trim();
  if (!t) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function formatJoinedAtDisplay(joinedAtIso: string | null | undefined): string {
  const ymd = formatJoinedAtForAdminInput(joinedAtIso);
  if (!ymd) return "—";
  const d = new Date(`${ymd}T12:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return ymd;
  return d.toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" });
}

/** Shared copy for office cleaners + payouts earnings rules panels. */
export function cleanerEarningsRulesSummaryText(): {
  minZar: number;
  maxZar: number;
  tenureMonthsThreshold: number;
  juniorRateLabel: string;
  experiencedRateLabel: string;
} {
  return {
    minZar: MIN_STANDARD_BASE_PAYOUT_CENTS / 100,
    maxZar: MAX_STANDARD_BASE_PAYOUT_CENTS / 100,
    tenureMonthsThreshold: CLEANER_TENURE_MONTHS_THRESHOLD,
    juniorRateLabel: formatCleanerPayoutRateLabel(resolveTenurePercentage(0)),
    experiencedRateLabel: formatCleanerPayoutRateLabel(resolveTenurePercentage(CLEANER_TENURE_MONTHS_THRESHOLD)),
  };
}
