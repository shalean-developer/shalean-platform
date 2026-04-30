import type { CleanerWeekdayCode } from "@/lib/cleaner/availabilityWeekdays";

/** Snapshot from `GET /api/cleaner/roster`. */
export type CleanerRosterSnapshot = {
  availability: Array<{ date: string; start_time: string; end_time: string; is_available: boolean }>;
  workingAreas: Array<{ id: string; name: string }>;
};

/** Normalised cleaner card for profile UIs (mobile tab + `/cleaner/profile`). */
export type CleanerMobileProfile = {
  name: string;
  phone: string;
  areas: string[];
  rating: number;
  isAvailable: boolean;
  jobsCompleted?: number;
  /** Weekdays ops may assign this cleaner (`cleaners.availability_weekdays`). */
  availabilityWeekdays: CleanerWeekdayCode[];
  /** ISO timestamp from `cleaners.created_at` when present. */
  createdAt?: string | null;
};
