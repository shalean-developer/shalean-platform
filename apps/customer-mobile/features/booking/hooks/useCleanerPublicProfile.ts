import { useQuery } from "@tanstack/react-query";
import { getBookingV2Api } from "@/services/customerApi";
import type { CleanerPublicProfile } from "@/services/types/bookingV2";

export function useCleanerPublicProfile(cleanerId: string | null | undefined, enabled = true) {
  const id = cleanerId?.trim() || "";

  return useQuery({
    queryKey: ["customer", "booking-v2", "cleaner-public-profile", id],
    enabled: enabled && Boolean(id),
    queryFn: async (): Promise<CleanerPublicProfile> => {
      const result = await getBookingV2Api().cleanerPublicProfile<CleanerPublicProfile>(id);
      if (!result.ok) {
        throw new Error(result.error || "Could not load cleaner profile.");
      }
      if (result.data.error) {
        throw new Error(result.data.error);
      }
      return result.data;
    },
    staleTime: 60_000,
  });
}
