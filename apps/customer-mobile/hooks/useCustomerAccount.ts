import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getCustomerAddressesApi,
  getCustomerInvoicesApi,
  getCustomerProfileApi,
} from "@/services/customerApi";
import type {
  CustomerAddressResponse,
  CustomerAddressRow,
  CustomerAddressesListResponse,
  CustomerInvoicesListResponse,
  CustomerProfileDto,
  CustomerProfileResponse,
} from "@/services/types/customerAccount";
import { isMissingApiRoute } from "@/lib/api/isMissingApiRoute";
import { getAccessToken } from "@/lib/auth/secureStoreTokenProvider";
import {
  applyCustomerProfilePatchViaSupabase,
  loadCustomerProfileViaSupabase,
} from "@/lib/profile/customerProfileSupabase";
import { useAuth } from "@/providers/AuthProvider";

export const customerProfileQueryKey = ["customer", "profile"] as const;
export const customerAddressesQueryKey = ["customer", "addresses"] as const;
export const customerInvoicesQueryKey = ["customer", "invoices"] as const;

function profileFromAuth(auth: {
  userId: string;
  email: string | null;
  fullName?: string | null;
}): CustomerProfileDto {
  return {
    id: auth.userId,
    email: auth.email,
    fullName: auth.fullName ?? null,
    phone: null,
    whatsapp: null,
    preferredContact: null,
    preferredNotificationChannel: null,
    dateOfBirth: null,
    billingEmail: null,
    tier: null,
  };
}

export function useCustomerProfile() {
  const { status, profile: authProfile } = useAuth();
  return useQuery({
    queryKey: [...customerProfileQueryKey, authProfile?.userId ?? null] as const,
    enabled: status === "signedIn" && Boolean(authProfile?.userId),
    queryFn: async (): Promise<CustomerProfileDto> => {
      const result = await getCustomerProfileApi().get<CustomerProfileResponse>();
      if (result.ok && result.data.profile) {
        const p = result.data.profile;
        return {
          ...p,
          email: p.email?.trim() || authProfile?.email || null,
          fullName: p.fullName?.trim() || authProfile?.fullName || null,
        };
      }

      // Prefer RLS read when REST route is not deployed yet.
      if (!result.ok && isMissingApiRoute(result) && authProfile?.userId) {
        const token = await getAccessToken();
        if (token) {
          try {
            return await loadCustomerProfileViaSupabase(
              token,
              authProfile.userId,
              authProfile.email,
            );
          } catch {
            return profileFromAuth(authProfile);
          }
        }
        return profileFromAuth(authProfile);
      }

      // Auth email is enough for checkout even if profile route fails transiently.
      if (authProfile) return profileFromAuth(authProfile);

      throw new Error(result.ok ? "Profile unavailable." : result.error);
    },
    staleTime: 60_000,
  });
}

export function usePatchCustomerProfile() {
  const queryClient = useQueryClient();
  const { profile: authProfile, refreshProfile } = useAuth();
  return useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const result = await getCustomerProfileApi().patch<CustomerProfileResponse>(body);
      if (result.ok && result.data.profile) return result.data.profile;

      if (!result.ok && isMissingApiRoute(result)) {
        const token = await getAccessToken();
        const userId = authProfile?.userId;
        if (!token || !userId) {
          throw new Error("Sign in required.");
        }
        const preferredContact: "whatsapp" | "email" | "phone" | undefined =
          body.preferredContact === "whatsapp" ||
          body.preferredContact === "email" ||
          body.preferredContact === "phone"
            ? body.preferredContact
            : undefined;
        const patch: {
          fullName?: string;
          phone?: string;
          whatsapp?: string;
          preferredContact?: "whatsapp" | "email" | "phone";
          dateOfBirth?: string | null;
        } = {
          fullName: typeof body.fullName === "string" ? body.fullName : undefined,
          phone: typeof body.phone === "string" ? body.phone : undefined,
          whatsapp: typeof body.whatsapp === "string" ? body.whatsapp : undefined,
          preferredContact,
          dateOfBirth:
            body.dateOfBirth === null
              ? null
              : typeof body.dateOfBirth === "string"
                ? body.dateOfBirth
                : undefined,
        };
        await applyCustomerProfilePatchViaSupabase(token, userId, patch);
        return loadCustomerProfileViaSupabase(token, userId, authProfile?.email ?? null);
      }

      throw new Error(result.ok ? "Could not save profile." : result.error);
    },
    onSuccess: async (profile) => {
      void queryClient.invalidateQueries({ queryKey: customerProfileQueryKey });
      queryClient.setQueryData([...customerProfileQueryKey, profile.id], profile);
      await refreshProfile().catch(() => undefined);
    },
  });
}

export function useCustomerAddresses() {
  const { status } = useAuth();
  return useQuery({
    queryKey: customerAddressesQueryKey,
    enabled: status === "signedIn",
    queryFn: async (): Promise<CustomerAddressRow[]> => {
      const result = await getCustomerAddressesApi().list<CustomerAddressesListResponse>();
      if (!result.ok) {
        if (isMissingApiRoute(result)) return [];
        throw new Error(result.error || "Could not load addresses.");
      }
      return Array.isArray(result.data.addresses) ? result.data.addresses : [];
    },
    staleTime: 60_000,
  });
}

export function useSaveCustomerAddress() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id?: string;
      body: Record<string, unknown>;
    }) => {
      const api = getCustomerAddressesApi();
      const result = input.id
        ? await api.update<CustomerAddressResponse>(input.id, input.body)
        : await api.create<CustomerAddressResponse>(input.body);
      if (!result.ok || !result.data.address) {
        if (!result.ok && isMissingApiRoute(result)) {
          throw new Error(
            "Addresses aren’t available on this server yet. Deploy the customer addresses API, or point EXPO_PUBLIC_API_BASE_URL at an environment that has it.",
          );
        }
        throw new Error(result.ok ? "Could not save address." : result.error);
      }
      return result.data.address;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: customerAddressesQueryKey });
    },
  });
}

export function useDeleteCustomerAddress() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const result = await getCustomerAddressesApi().remove<{ ok?: boolean }>(id);
      if (!result.ok) throw new Error(result.error || "Could not delete address.");
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: customerAddressesQueryKey });
    },
  });
}

export function useCustomerInvoices() {
  const { status } = useAuth();
  return useQuery({
    queryKey: customerInvoicesQueryKey,
    enabled: status === "signedIn",
    queryFn: async () => {
      const result = await getCustomerInvoicesApi().list<CustomerInvoicesListResponse>();
      if (!result.ok) {
        if (isMissingApiRoute(result)) return { monthly: [], perVisit: [] };
        throw new Error(result.error || "Could not load invoices.");
      }
      return {
        monthly: result.data.monthly ?? [],
        perVisit: result.data.perVisit ?? [],
      };
    },
    staleTime: 60_000,
  });
}
