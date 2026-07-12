import { useQuery } from "@tanstack/react-query";
import { getBookingV2Api } from "@/services/customerApi";
import type { AvailableCleanerV2, AvailableTeam } from "@/services/types/bookingV2";

export function useAvailableCleaners(params: {
  serviceSlug: string;
  date: string;
  time: string;
  durationMinutes: number;
  locationId: string;
  enabled?: boolean;
}) {
  const { serviceSlug, date, time, durationMinutes, locationId, enabled = true } = params;

  return useQuery({
    queryKey: [
      "customer",
      "booking-v2",
      "available-cleaners",
      serviceSlug,
      date,
      time,
      durationMinutes,
      locationId,
    ],
    enabled: enabled && Boolean(serviceSlug) && Boolean(locationId),
    queryFn: async (): Promise<AvailableCleanerV2[]> => {
      const query: Record<string, string> = { serviceSlug };
      if (date) query.date = date;
      if (time) query.time = time;
      if (durationMinutes) query.durationMinutes = String(durationMinutes);
      if (locationId) query.locationId = locationId;

      const result = await getBookingV2Api().availableCleaners<{
        cleaners?: AvailableCleanerV2[];
        error?: string;
      }>(query);
      if (!result.ok) {
        throw new Error(result.error || "Could not load cleaners.");
      }
      if (result.data.error) {
        throw new Error(result.data.error);
      }
      return result.data.cleaners ?? [];
    },
    staleTime: 15_000,
  });
}

export function useTeamAvailability(params: {
  date: string;
  serviceSlug: string;
  enabled?: boolean;
}) {
  const { date, serviceSlug, enabled = true } = params;

  return useQuery({
    queryKey: ["customer", "booking-v2", "team-availability", date, serviceSlug],
    enabled: enabled && Boolean(date) && /^\d{4}-\d{2}-\d{2}$/.test(date),
    queryFn: async (): Promise<{ available: boolean; teams: AvailableTeam[] }> => {
      const result = await getBookingV2Api().teamAvailability<{
        available?: boolean;
        teams?: AvailableTeam[];
        error?: string;
      }>({ date, service: serviceSlug });
      if (!result.ok) {
        throw new Error(result.error || "Could not check team availability.");
      }
      return {
        available: Boolean(result.data.available),
        teams: result.data.teams ?? [],
      };
    },
    staleTime: 15_000,
  });
}
