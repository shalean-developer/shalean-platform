import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { markSynced } from "@/lib/network/networkStatus";
import { useAuth } from "@/providers/AuthProvider";
import { CleanerApi } from "@/services/cleanerApi";
import { cleanerQueryKeys } from "@/hooks/useCleanerProfile";

export function useCleanerReferrals() {
  const { status } = useAuth();
  return useQuery({
    queryKey: cleanerQueryKeys.referrals,
    queryFn: async () => {
      const res = await CleanerApi.referralsMe();
      if (!res.ok) throw new Error(res.error);
      markSynced();
      return res.data;
    },
    enabled: status === "signedIn",
    placeholderData: (prev) => prev,
    staleTime: 60_000,
  });
}

export function useCleanerProfileSummary() {
  const { status } = useAuth();
  return useQuery({
    queryKey: cleanerQueryKeys.profileSummary,
    queryFn: async () => {
      const res = await CleanerApi.profileSummary();
      if (!res.ok) throw new Error(res.error);
      markSynced();
      return res.data;
    },
    enabled: status === "signedIn",
    placeholderData: (prev) => prev,
    staleTime: 30_000,
  });
}

export function useCleanerFeedbackList() {
  const { status } = useAuth();
  return useQuery({
    queryKey: cleanerQueryKeys.feedback,
    queryFn: async () => {
      const res = await CleanerApi.listFeedback();
      if (!res.ok) throw new Error(res.error);
      return res.data;
    },
    enabled: status === "signedIn",
    staleTime: 30_000,
  });
}

export function useSubmitCleanerFeedback() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: {
      submission_type: "report" | "feedback";
      subject?: string | null;
      message: string;
    }) => {
      const res = await CleanerApi.submitFeedback(body);
      if (!res.ok) throw new Error(res.error);
      return res.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: cleanerQueryKeys.feedback });
    },
  });
}
