import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { johannesburgCalendarYmd, johannesburgCalendarYmdAddDays } from "@shalean/utils";
import { filterTodaysJobs, sortJobsByTime } from "@/lib/jobs/jobDisplay";
import { markSynced } from "@/lib/network/networkStatus";
import { useAuth } from "@/providers/AuthProvider";
import { JobsApi } from "@/services/jobsApi";
import { cleanerQueryKeys } from "@/hooks/useCleanerProfile";
import type { CleanerJobWire } from "@/services/types/cleanerJobs";

/** Shared card-view jobs list (Today + Schedule). */
export function useCleanerJobsCard() {
  const { status } = useAuth();

  return useQuery({
    queryKey: cleanerQueryKeys.jobsCard,
    queryFn: async () => {
      const res = await JobsApi.listTodayCard();
      if (!res.ok) throw new Error(res.error);
      markSynced();
      return res.data.jobs ?? [];
    },
    enabled: status === "signedIn",
    placeholderData: (prev) => prev,
  });
}

export function useTodaysJobs() {
  const query = useCleanerJobsCard();
  const today = johannesburgCalendarYmd();

  const data = useMemo(() => {
    if (!query.data) return undefined;
    return filterTodaysJobs(query.data);
  }, [query.data, today]);

  return { ...query, data };
}

/** Jobs from today through +horizonDays (Johannesburg calendar). */
export function useScheduleJobs(horizonDays = 13) {
  const query = useCleanerJobsCard();
  const today = johannesburgCalendarYmd();
  const end = johannesburgCalendarYmdAddDays(today, horizonDays);

  const data = useMemo(() => {
    if (!query.data) return undefined;
    return sortJobsByTime(
      query.data.filter((j) => {
        const d = String(j.date ?? "").trim();
        return Boolean(d) && d >= today && d <= end;
      }),
    );
  }, [query.data, today, end]);

  return { ...query, data };
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

export function jobsForDate(jobs: CleanerJobWire[] | undefined, ymd: string): CleanerJobWire[] {
  if (!jobs) return [];
  return sortJobsByTime(jobs.filter((j) => String(j.date ?? "").trim() === ymd));
}
