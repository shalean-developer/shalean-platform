import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/providers/AuthProvider";
import { CleanerApi } from "@/services/cleanerApi";

export const cleanerQueryKeys = {
  me: ["cleaner", "me"] as const,
  jobsCard: ["cleaner", "jobs", "card"] as const,
  todaysJobs: ["cleaner", "jobs", "today"] as const,
  dashboard: ["cleaner", "dashboard"] as const,
  earnings: ["cleaner", "earnings"] as const,
  roster: ["cleaner", "roster"] as const,
  notifications: ["cleaner", "notifications"] as const,
  referrals: ["cleaner", "referrals"] as const,
  profileSummary: ["cleaner", "profile-summary"] as const,
  feedback: ["cleaner", "feedback"] as const,
  job: (id: string) => ["cleaner", "jobs", id] as const,
};

export function useCleanerProfile() {
  const { status } = useAuth();
  return useQuery({
    queryKey: cleanerQueryKeys.me,
    queryFn: async () => {
      const res = await CleanerApi.me();
      if (!res.ok) throw new Error(res.error);
      return res.data;
    },
    enabled: status === "signedIn",
  });
}
