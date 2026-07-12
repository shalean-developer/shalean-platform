import { useQuery } from "@tanstack/react-query";
import { getCustomerBookingsApi } from "@/services/customerApi";
import type {
  CustomerBookingDetailResponse,
  CustomerBookingRow,
  CustomerBookingsListResponse,
} from "@/services/types/customerBookings";
import { useAuth } from "@/providers/AuthProvider";

export const customerBookingsQueryKey = ["customer", "bookings", "list"] as const;

export function customerBookingDetailQueryKey(id: string) {
  return ["customer", "bookings", "detail", id] as const;
}

export function useCustomerBookingsList() {
  const { status } = useAuth();

  return useQuery({
    queryKey: customerBookingsQueryKey,
    enabled: status === "signedIn",
    queryFn: async (): Promise<CustomerBookingRow[]> => {
      const result = await getCustomerBookingsApi().list<CustomerBookingsListResponse>();
      if (!result.ok) {
        throw new Error(result.error || "Could not load bookings.");
      }
      return Array.isArray(result.data.bookings) ? result.data.bookings : [];
    },
    staleTime: 30_000,
  });
}

export function useCustomerBookingDetail(id: string | undefined) {
  const { status } = useAuth();
  const bookingId = (id ?? "").trim();

  return useQuery({
    queryKey: customerBookingDetailQueryKey(bookingId),
    enabled: status === "signedIn" && Boolean(bookingId),
    queryFn: async (): Promise<CustomerBookingRow> => {
      const result = await getCustomerBookingsApi().get<CustomerBookingDetailResponse>(bookingId);
      if (!result.ok) {
        throw new Error(result.error || "Could not load this booking.");
      }
      if (!result.data.booking) {
        throw new Error("Booking not found.");
      }
      return result.data.booking;
    },
    staleTime: 15_000,
  });
}
