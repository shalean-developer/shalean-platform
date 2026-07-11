import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/providers/AuthProvider";
import { CleanerApi } from "@/services/cleanerApi";

export const cleanerQueryKeys = {
  me: ["cleaner", "me"] as const,
  todaysJobs: ["cleaner", "jobs", "today"] as const,
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
