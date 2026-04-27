/** Inputs for pure scoring (no DB). */
export type CleanerScoringInput = {
  id: string;
  /** Haversine km to job location. */
  distanceKm: number;
  /** 0–5 scale. */
  rating: number;
  /** 0–1 lifetime or blended acceptance. */
  acceptanceRate: number;
  /** Recent offer declines (e.g. last 7d) — penalty when high. */
  recentDeclines: number;
  /** ISO timestamp of last assignment to a job, or null if unknown. */
  lastAssignmentAt: string | null;
  /** Active-ish jobs today (assigned/in_progress/pending for same calendar day). */
  workloadToday: number;
  /** Soft cap before workload penalty ramps (dispatch tuning). */
  maxDailyJobs?: number;
};

export type BookingScoringContext = {
  bookingId: string;
  /** For logs / correlation only. */
  dateYmd?: string;
  timeHm?: string;
};

export type CleanerScoreBreakdown = {
  /** Subscore contributions (roughly 0–25 each before clamp). */
  distance: number;
  rating: number;
  reliability: number;
  workload: number;
  recency: number;
};

export type CleanerScoreResult = {
  score: number;
  breakdown: CleanerScoreBreakdown;
};

export type DemandLevelForecast = "low" | "medium" | "high";

export type DynamicPricingContext = {
  /** Hour 0–23 local to pricing decision. */
  hourOfDay: number;
  /** 0 = Sunday … 6 = Saturday (JS). */
  dayOfWeek: number;
  demandLevel: DemandLevelForecast;
  /** 0–1 approximate share of cleaners free in area (optional). */
  cleanerAvailabilityRatio?: number | null;
};

export type DynamicPriceResult = {
  final_price: number;
  price_adjustment_reason: string;
};

export type ForecastDemandResult = {
  demand_level: DemandLevelForecast;
  predicted_bookings: number;
};

export type ClusteredBooking<T extends { id: string }> = T & { cluster_id: string };
