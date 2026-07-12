import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getCustomerRecurringApi } from "@/services/customerApi";
import type { RecurringListResponse, RecurringPlanRow } from "@/services/types/customerBookings";
import { useAuth } from "@/providers/AuthProvider";

export const customerRecurringQueryKey = ["customer", "recurring", "list"] as const;

export type RecurringAction = "pause" | "resume" | "skip" | "cancel";

export function useCustomerRecurringPlans() {
  const { status } = useAuth();

  return useQuery({
    queryKey: customerRecurringQueryKey,
    enabled: status === "signedIn",
    queryFn: async (): Promise<RecurringPlanRow[]> => {
      const result = await getCustomerRecurringApi().list<RecurringListResponse>();
      if (!result.ok) {
        throw new Error(result.error || "Could not load recurring plans.");
      }
      return Array.isArray(result.data.items) ? result.data.items : [];
    },
    staleTime: 30_000,
  });
}

export function useRecurringPlanAction() {
  const queryClient = useQueryClient();
  const api = getCustomerRecurringApi();

  return useMutation({
    mutationFn: async ({ id, action }: { id: string; action: RecurringAction }) => {
      const result = await api[action]<{ ok?: boolean; error?: string }>(id);
      if (!result.ok) {
        throw new Error(result.error || `Could not ${action} this plan.`);
      }
      return result.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: customerRecurringQueryKey });
    },
  });
}
