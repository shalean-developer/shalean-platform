import { normalizeCleanerAvailabilityWeekdays } from "@/lib/cleaner/availabilityWeekdays";
import type { CleanerMobileProfile } from "@/lib/cleaner/cleanerProfileTypes";

/** Row shape from `GET /api/cleaner/me` `cleaner` (subset). */
export type CleanerMeRow = {
  id: string;
  full_name?: string | null;
  phone?: string | null;
  phone_number?: string | null;
  status?: string | null;
  is_available?: boolean | null;
  rating?: number | null;
  jobs_completed?: number | null;
  created_at?: string | null;
  location?: string | null;
  availability_weekdays?: string[] | null;
};

export function mapCleanerMeToMobileProfile(cleaner: CleanerMeRow | null): CleanerMobileProfile | null {
  if (!cleaner) return null;
  const phone = String(cleaner.phone_number ?? cleaner.phone ?? "").trim() || "—";
  const areas = cleaner.location?.trim() ? [cleaner.location.trim()] : ["Areas not set"];
  const jobsCompleted =
    typeof cleaner.jobs_completed === "number" && Number.isFinite(cleaner.jobs_completed)
      ? Math.max(0, Math.round(cleaner.jobs_completed))
      : 0;
  const createdRaw = cleaner.created_at;
  const createdAt =
    typeof createdRaw === "string" && createdRaw.trim().length > 0 ? createdRaw.trim() : null;
  return {
    name: cleaner.full_name?.trim() || "Cleaner",
    phone,
    areas,
    rating: typeof cleaner.rating === "number" && Number.isFinite(cleaner.rating) ? cleaner.rating : 5,
    isAvailable: cleaner.is_available === true || String(cleaner.status ?? "").toLowerCase() === "available",
    jobsCompleted,
    availabilityWeekdays: normalizeCleanerAvailabilityWeekdays(cleaner.availability_weekdays),
    createdAt,
  };
}
