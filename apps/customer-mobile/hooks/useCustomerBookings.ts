import { useQuery } from "@tanstack/react-query";
import type { ApiResult } from "@shalean/api-client";
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
      const api = getCustomerBookingsApi();
      const rows = new Map<string, CustomerBookingRow>();
      const seenCursors = new Set<string>();
      let cursor: string | null = null;

      do {
        const result: ApiResult<CustomerBookingsListResponse> = await api.list<CustomerBookingsListResponse>({
          cursor,
          limit: 25,
        });
        if (!result.ok) throw new Error(result.error || "Could not load bookings.");
        for (const booking of Array.isArray(result.data.bookings) ? result.data.bookings : []) {
          rows.set(booking.id, booking);
        }

        const nextCursor: string | null = result.data.pageInfo?.hasMore === true
          ? result.data.pageInfo.nextCursor
          : null;
        if (!nextCursor) break;
        if (seenCursors.has(nextCursor)) throw new Error("Bookings pagination did not converge.");
        seenCursors.add(nextCursor);
        cursor = nextCursor;
      } while (cursor);

      return Array.from(rows.values());
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
