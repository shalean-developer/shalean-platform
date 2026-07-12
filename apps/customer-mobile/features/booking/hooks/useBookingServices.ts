import { useQuery } from "@tanstack/react-query";
import { getBookingV2Api } from "@/services/customerApi";
import type { BookingV2CatalogPayload } from "@/services/types/bookingV2";
import { isServiceSlug } from "@/lib/booking/serviceMeta";

export const bookingServicesQueryKey = ["customer", "booking-v2", "services"] as const;

export function useBookingServices() {
  return useQuery({
    queryKey: bookingServicesQueryKey,
    queryFn: async (): Promise<BookingV2CatalogPayload> => {
      const result = await getBookingV2Api().services<BookingV2CatalogPayload>();
      if (!result.ok) {
        throw new Error(result.error || "Could not load cleaning services.");
      }
      const data = result.data;
      const active = (data.activeServiceSlugs ?? []).filter(isServiceSlug);
      return {
        ...data,
        activeServiceSlugs: active,
        catalog: data.catalog ?? {},
        feesConfig: data.feesConfig,
        scheduling: data.scheduling,
      };
    },
    staleTime: 60_000,
  });
}
