import type { CleanerDashboardTodayBreakdownItem } from "@/lib/cleaner/cleanerDashboardTodayCents";

/** Dashboard card props — mapped from `GET /api/cleaner/offers` rows + live `expires_at` countdown. */
export type CleanerJobOffer = {
  id: string;
  serviceLabel: string;
  suburb: string;
  payZarLabel: string;
  scheduleLine: string;
  /** ISO timestamp — live countdown from {@link CountdownTimer}. */
  expiresAt: string;
  /** Echoed for accept POST body (`buildCleanerOfferAcceptBody`). */
  uxVariant?: string | null;
};

export type CleanerUpcomingJob = {
  id: string;
  timeLine: string;
  suburb: string;
  href: string;
  /** Assigned / En route / In progress / Completed / … from {@link mobilePhaseDisplayForDashboard}. */
  phaseDisplay: string;
};

/** Matches `GET /api/cleaner/dashboard` `summary.today_breakdown`. */
export type CleanerEarningsBreakdownLine = CleanerDashboardTodayBreakdownItem;

export type CleanerEarningsSnapshot = {
  todayZarLabel: string;
  todayBreakdown: CleanerEarningsBreakdownLine[];
  /** True when today total is zero — show explainer (not an error / not loading). */
  showZeroEarningsHint: boolean;
  /** Short line under “Today” (motivation / zero-state). */
  earningsMotivationLine: string | null;
  /** When today is R0 but an open job today has estimated cleaner cents — e.g. “R150”. */
  potentialNextJobZarLabel: string | null;
  /** When multiple open jobs today have different estimates — e.g. “R150–R300”. */
  potentialRangeZarLabel: string | null;
  /** Raw cents today (for progress); null while loading. */
  todayCentsValue: number | null;
  /** Soft daily goal in cents (e.g. R500). */
  dailyGoalCents: number;
  /** Forward-looking line when “Today” is R0 — avoids a dead-end feeling. */
  earningsForwardLine: string | null;
};
