import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { johannesburgCalendarYmd } from "@shalean/utils";
import { markSynced } from "@/lib/network/networkStatus";
import { useAuth } from "@/providers/AuthProvider";
import { CleanerApi } from "@/services/cleanerApi";
import { JobsApi } from "@/services/jobsApi";
import { cleanerQueryKeys } from "@/hooks/useCleanerProfile";

/** Dashboard summary (today earnings) — falls back gracefully when offline/cached. */
export function useCleanerDashboard() {
  const { status } = useAuth();
  const today = johannesburgCalendarYmd();

  return useQuery({
    queryKey: [...cleanerQueryKeys.dashboard, today],
    queryFn: async () => {
      const res = await JobsApi.dashboard();
      if (!res.ok) throw new Error(res.error);
      markSynced();
      return res.data;
    },
    enabled: status === "signedIn",
    placeholderData: (prev) => prev,
    retry: 1,
  });
}

/** Full earnings summary + payout history rows. */
export function useCleanerEarnings() {
  const { status } = useAuth();

  return useQuery({
    queryKey: cleanerQueryKeys.earnings,
    queryFn: async () => {
      const res = await CleanerApi.earnings();
      if (!res.ok) throw new Error(res.error);
      markSynced();
      return res.data;
    },
    enabled: status === "signedIn",
    placeholderData: (prev) => prev,
    staleTime: 60_000,
  });
}

/** Roster availability windows + working areas (next ~14 days). */
export function useCleanerRoster() {
  const { status } = useAuth();

  return useQuery({
    queryKey: cleanerQueryKeys.roster,
    queryFn: async () => {
      const res = await CleanerApi.roster();
      if (!res.ok) throw new Error(res.error);
      markSynced();
      return res.data;
    },
    enabled: status === "signedIn",
    placeholderData: (prev) => prev,
    staleTime: 60_000,
  });
}

/** Toggle cleaner availability via PATCH /api/cleaner/me. */
export function useSetAvailability() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (isAvailable: boolean) => {
      const res = await CleanerApi.setAvailability(isAvailable);
      if (!res.ok) throw new Error(res.error);
      return res.data;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(cleanerQueryKeys.me, data);
      void queryClient.invalidateQueries({ queryKey: cleanerQueryKeys.me });
      void queryClient.invalidateQueries({ queryKey: cleanerQueryKeys.roster });
    },
  });
}
