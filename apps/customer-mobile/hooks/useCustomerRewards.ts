import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getCustomerDashboardApi,
  getCustomerReviewsApi,
  getReferralsApi,
} from "@/services/customerApi";
import type {
  AccountRewardsResponse,
  CreditHistoryResponse,
  CustomerReviewRow,
  CustomerReviewsListResponse,
  ReferralSettingsResponse,
  ReferralsMeResponse,
  RewardsCreditHistoryRow,
} from "@/services/types/customerRewards";
import { useAuth } from "@/providers/AuthProvider";

export const accountRewardsQueryKey = ["customer", "rewards"] as const;
export const referralsMeQueryKey = ["customer", "referrals", "me"] as const;
export const referralSettingsQueryKey = ["customer", "referrals", "settings"] as const;
export const creditHistoryQueryKey = ["customer", "referrals", "credit-history"] as const;
export const customerReviewsQueryKey = ["customer", "reviews"] as const;

export function useAccountRewards() {
  const { status } = useAuth();
  return useQuery({
    queryKey: accountRewardsQueryKey,
    enabled: status === "signedIn",
    queryFn: async (): Promise<AccountRewardsResponse> => {
      const result = await getCustomerDashboardApi().rewards<AccountRewardsResponse>();
      if (!result.ok) throw new Error(result.error || "Could not load rewards.");
      return result.data;
    },
    staleTime: 60_000,
  });
}

export function useReferralsMe() {
  const { status } = useAuth();
  return useQuery({
    queryKey: referralsMeQueryKey,
    enabled: status === "signedIn",
    queryFn: async (): Promise<ReferralsMeResponse> => {
      const result = await getReferralsApi().me<ReferralsMeResponse>();
      if (!result.ok) throw new Error(result.error || "Could not load referrals.");
      return result.data;
    },
    staleTime: 60_000,
  });
}

export function useReferralSettings() {
  return useQuery({
    queryKey: referralSettingsQueryKey,
    queryFn: async (): Promise<ReferralSettingsResponse> => {
      const result = await getReferralsApi().settings<ReferralSettingsResponse>();
      if (!result.ok) throw new Error(result.error || "Could not load referral settings.");
      return result.data;
    },
    staleTime: 5 * 60_000,
  });
}

export function useCreditHistory() {
  const { status } = useAuth();
  return useQuery({
    queryKey: creditHistoryQueryKey,
    enabled: status === "signedIn",
    queryFn: async (): Promise<RewardsCreditHistoryRow[]> => {
      const result = await getReferralsApi().creditHistory<CreditHistoryResponse>();
      if (!result.ok) throw new Error(result.error || "Could not load credit history.");
      return Array.isArray(result.data.transactions) ? result.data.transactions : [];
    },
    staleTime: 60_000,
  });
}

export function useCustomerReviews() {
  const { status } = useAuth();
  return useQuery({
    queryKey: customerReviewsQueryKey,
    enabled: status === "signedIn",
    queryFn: async (): Promise<CustomerReviewRow[]> => {
      const result = await getCustomerDashboardApi().reviews<CustomerReviewsListResponse>();
      if (!result.ok) throw new Error(result.error || "Could not load reviews.");
      return Array.isArray(result.data.reviews) ? result.data.reviews : [];
    },
    staleTime: 60_000,
  });
}

export function useSubmitReview() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: { bookingId: string; rating: number; comment?: string }) => {
      const result = await getCustomerReviewsApi().submit(body);
      if (!result.ok) throw new Error(result.error || "Could not submit review.");
      return result.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: customerReviewsQueryKey });
    },
  });
}
