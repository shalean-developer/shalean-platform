import type { ServiceSlug } from "@/lib/booking/serviceMeta";
import {
  estimateBookingV2DurationMinutes,
  resolveBookingV2DurationEstimate,
} from "@shalean/pricing";

/**
 * Job duration for slot eligibility / display — shared @shalean/pricing
 * (Phase 2) so mobile matches web booking-v2 duration_minutes + team scaling.
 */
export function estimateBookingDurationMinutes(input: {
  serviceSlug: ServiceSlug;
  serviceDetails: Record<string, string | number | boolean>;
  selectedExtras: readonly string[];
  minDurationHours?: number;
  maxDurationHours?: number;
  cleanerMode?: "team" | "individual_cleaners";
  cleanerCount?: number;
  /** When true, return team-scaled wall-clock minutes for availability windows. */
  useTeamScaled?: boolean;
}): number {
  const result = resolveBookingV2DurationEstimate({
    serviceSlug: input.serviceSlug,
    serviceDetails: input.serviceDetails,
    selectedExtras: input.selectedExtras,
    cleanerMode: input.cleanerMode,
    cleanerCount: input.cleanerCount,
    minDurationHours: input.minDurationHours,
    maxDurationHours: input.maxDurationHours,
  });
  return input.useTeamScaled ? result.team_scaled_duration_minutes : result.duration_minutes;
}

export { estimateBookingV2DurationMinutes };
