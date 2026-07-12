import { useQuery } from "@tanstack/react-query";
import { getCustomerBookingsApi } from "@/services/customerApi";
import type {
  CustomerBookingTrackDto,
  CustomerBookingTrackResponse,
} from "@/services/types/customerTrack";
import { useAuth } from "@/providers/AuthProvider";

export function customerBookingTrackQueryKey(id: string) {
  return ["customer", "bookings", "track", id] as const;
}

export function useCustomerBookingTrack(id: string | undefined) {
  const { status } = useAuth();
  const bookingId = (id ?? "").trim();

  return useQuery({
    queryKey: customerBookingTrackQueryKey(bookingId),
    enabled: status === "signedIn" && Boolean(bookingId),
    queryFn: async (): Promise<CustomerBookingTrackDto> => {
      const result = await getCustomerBookingsApi().track<CustomerBookingTrackResponse>(bookingId);
      if (!result.ok) {
        const err = new Error(result.error || "Could not load tracking.") as Error & {
          status?: number;
        };
        err.status = result.status;
        throw err;
      }
      if (!result.data.track) {
        throw new Error("Tracking unavailable.");
      }
      return result.data.track;
    },
    staleTime: 5_000,
    refetchInterval: (query) => {
      const data = query.state.data;
      return data?.trackable ? 10_000 : false;
    },
  });
}
