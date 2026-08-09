import { useQuery } from "@tanstack/react-query";
import { getMobileApiClient } from "@/lib/api/createMobileApiClient";
import { useAuth } from "@/providers/AuthProvider";
import type { CleanerTrainingComplianceResponse } from "@/services/types/cleanerTrainingCompliance";

export const cleanerTrainingComplianceKey = ["cleaner", "training-compliance"] as const;

export function useCleanerTrainingCompliance() {
  const { status } = useAuth();
  return useQuery({
    queryKey: cleanerTrainingComplianceKey,
    queryFn: async () => {
      const res = await getMobileApiClient().requestJson<CleanerTrainingComplianceResponse>(
        "/api/cleaner/training-compliance",
      );
      if (!res.ok) throw new Error(res.error);
      return res.data;
    },
    enabled: status === "signedIn",
  });
}
