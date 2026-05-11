/**
 * Shape returned by `GET /api/cleaners/available` (marketing / browse roster only).
 * Not slot-aware — do not use for booking eligibility (use `/api/booking/cleaners` + lock validation).
 */
export type AvailableCleanerDto = {
  id: string;
  name: string;
  /** Average review score 0–5 */
  rating: number;
  jobs: number;
  /** 0–100, derived from rating for display */
  recommendPct: number;
  /** Public photo URL when present */
  image: string | null;
};
