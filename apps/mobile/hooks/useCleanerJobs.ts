import { useQuery } from "@tanstack/react-query";
import { johannesburgCalendarYmd } from "@shalean/utils";
import { filterTodaysJobs } from "@/lib/jobs/jobDisplay";
import { markSynced } from "@/lib/network/networkStatus";
import { useAuth } from "@/providers/AuthProvider";
import { JobsApi } from "@/services/jobsApi";
import { cleanerQueryKeys } from "@/hooks/useCleanerProfile";

export function useTodaysJobs() {
  const { status } = useAuth();
  const today = johannesburgCalendarYmd();

  return useQuery({
    queryKey: [...cleanerQueryKeys.todaysJobs, today],
    queryFn: async () => {
      const res = await JobsApi.listTodayCard();
      if (!res.ok) throw new Error(res.error);
      markSynced();
      return filterTodaysJobs(res.data.jobs ?? []);
    },
    enabled: status === "signedIn",
    // Keep previous day's cache visible only for matching key; offlineFirst serves disk cache.
    placeholderData: (prev) => prev,
  });
}

export function useJobDetail(bookingId: string | undefined) {
  const { status } = useAuth();
  return useQuery({
    queryKey: cleanerQueryKeys.job(bookingId ?? ""),
    queryFn: async () => {
      if (!bookingId) throw new Error("Missing job id");
      const res = await JobsApi.get(bookingId);
      if (!res.ok) throw new Error(res.error);
      markSynced();
      return res.data.job;
    },
    enabled: status === "signedIn" && Boolean(bookingId),
    placeholderData: (prev) => prev,
  });
}
