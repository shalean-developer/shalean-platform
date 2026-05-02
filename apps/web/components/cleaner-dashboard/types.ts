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
};

export type CleanerEarningsSnapshot = {
  todayZarLabel: string;
};
