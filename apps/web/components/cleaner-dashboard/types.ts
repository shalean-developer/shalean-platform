import type { CleanerDashboardTodayBreakdownItem } from "@/lib/cleaner/cleanerDashboardTodayCents";
import type { CleanerJobEarning } from "@/lib/cleaner/cleanerJobEarning";

/** Dashboard card props — mapped from `GET /api/cleaner/offers` rows + live `expires_at` countdown. */
export type CleanerJobOffer = {
  id: string;
  serviceLabel: string;
  suburb: string;
  /**
   * Legacy compact amount label rendered next to the title (e.g. "R400.00" / "—").
   * Retained for compatibility while components migrate to {@link jobEarning}.
   * @deprecated New surfaces should use {@link jobEarning} (`Job earning: R___`).
   */
  payZarLabel: string;
  /**
   * Canonical "Job earning" amount for the cleaner — actual configured pay
   * for accepting this specific job. Render via
   * `formatCleanerJobEarningDisplay(jobEarning)` so the wording is always
   * "Job earning: R___" or "Job earning unavailable", never "Estimated payout".
   */
  jobEarning: CleanerJobEarning;
  /**
   * Legacy single-line summary, e.g. `"Today • 08:30 • 2 bed • 1 bath"`.
   * Retained for any caller still rendering the offer in a single line.
   * New surfaces should prefer the structured fields below so each piece can
   * sit in its own icon row (per dispatch-app spec).
   */
  scheduleLine: string;
  /** Short date heading from {@link jobDateHeading}, e.g. `"May 15"` / `"Today"`. */
  dateLabel?: string;
  /** Time-of-day, e.g. `"08:30"` (no day, no `—` placeholder). */
  timeLabel?: string;
  /** Bedrooms count from booking snapshot when available. */
  bedrooms?: number | null;
  /** Bathrooms count from booking snapshot when available. */
  bathrooms?: number | null;
  /** ISO timestamp — live countdown from {@link CountdownTimer}. */
  expiresAt: string;
  /** Echoed for accept POST body (`buildCleanerOfferAcceptBody`). */
  uxVariant?: string | null;
  /** Public offer link; used when SMS may not have delivered. */
  offerToken?: string;
  /** ISO — row `created_at` for soft SMS-outage hint. */
  offerCreatedAtIso?: string;
  /** When dispatch SMS was recorded; absence + fresh row → subtle “SMS may have failed” hint. */
  smsSentAt?: string | null;
  /** preferred | backup — drives dispatch copy on the offer card. */
  offerType?: "preferred" | "backup" | null;
  /** Short-window same-day / urgent offer. */
  isUrgentOffer?: boolean;
  /** ISO deadline for preferred-cleaner accept copy. */
  acceptDeadlineIso?: string;
};

export type CleanerUpcomingJob = {
  id: string;
  timeLine: string;
  suburb: string;
  href: string;
  /** Assigned / En route / In progress / Completed / … from {@link mobilePhaseDisplayForDashboard}. */
  phaseDisplay: string;
  /**
   * Canonical "Job earning" amount for the cleaner — same source-of-truth
   * as the offer card. Always present so the upcoming card and the
   * next-job pin can render "Job earning: R___" without re-resolving.
   */
  jobEarning: CleanerJobEarning;
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
