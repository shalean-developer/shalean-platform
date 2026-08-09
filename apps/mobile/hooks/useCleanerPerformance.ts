import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/providers/AuthProvider";
import { CleanerApi } from "@/services/cleanerApi";

export const cleanerPerformanceQueryKey = (days: number) => ["cleaner", "performance", days] as const;

export function useCleanerPerformance(days = 90) {
  const { status } = useAuth();
  return useQuery({
    queryKey: cleanerPerformanceQueryKey(days),
    queryFn: async () => {
      const res = await CleanerApi.performance(days);
      if (!res.ok) throw new Error(res.error);
      return res.data;
    },
    enabled: status === "signedIn",
  });
}
