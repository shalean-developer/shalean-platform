import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getCustomerNotificationsApi } from "@/services/customerApi";
import type {
  CustomerNotificationRow,
  CustomerNotificationsListResponse,
} from "@/services/types/customerNotifications";
import { isMissingApiRoute } from "@/lib/api/isMissingApiRoute";
import { useAuth } from "@/providers/AuthProvider";

export const customerNotificationsQueryKey = ["customer", "notifications"] as const;

export function useCustomerNotifications() {
  const { status } = useAuth();
  return useQuery({
    queryKey: customerNotificationsQueryKey,
    enabled: status === "signedIn",
    queryFn: async (): Promise<{
      notifications: CustomerNotificationRow[];
      unreadCount: number;
    }> => {
      const result =
        await getCustomerNotificationsApi().list<CustomerNotificationsListResponse>();
      if (!result.ok) {
        if (isMissingApiRoute(result)) return { notifications: [], unreadCount: 0 };
        throw new Error(result.error || "Could not load notifications.");
      }
      return {
        notifications: Array.isArray(result.data.notifications) ? result.data.notifications : [],
        unreadCount: typeof result.data.unreadCount === "number" ? result.data.unreadCount : 0,
      };
    },
    staleTime: 30_000,
  });
}

export function useMarkNotificationsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: { id?: string; all?: boolean }) => {
      const result = await getCustomerNotificationsApi().markRead(body);
      if (!result.ok) throw new Error(result.error || "Could not mark as read.");
      return result.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: customerNotificationsQueryKey });
    },
  });
}
