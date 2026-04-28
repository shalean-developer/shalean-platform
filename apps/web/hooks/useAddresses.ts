"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import type { CustomerAddressInput, CustomerAddressRow } from "@/lib/dashboard/types";
import { useUser } from "@/hooks/useUser";

export function useAddresses(): {
  addresses: CustomerAddressRow[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  insertAddress: (input: CustomerAddressInput) => Promise<{ ok: true; id: string } | { ok: false; message: string }>;
  updateAddress: (
    id: string,
    patch: Partial<Pick<CustomerAddressRow, "label" | "line1" | "suburb" | "city" | "postal_code" | "is_default">>,
  ) => Promise<{ ok: true } | { ok: false; message: string }>;
  deleteAddress: (id: string) => Promise<{ ok: true } | { ok: false; message: string }>;
  setDefaultAddress: (id: string) => Promise<{ ok: true } | { ok: false; message: string }>;
} {
  const { user, loading: userLoading } = useUser();
  const [addresses, setAddresses] = useState<CustomerAddressRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAddresses = useCallback(async () => {
    if (!user?.id) {
      setAddresses([]);
      setLoading(false);
      return;
    }
    const sb = getSupabaseClient();
    if (!sb) {
      setError("Supabase is not configured.");
      setAddresses([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const res = await sb
      .from("customer_saved_addresses")
      .select("*")
      .eq("user_id", user.id)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: true });
    if (res.error) {
      setError(res.error.message);
      setAddresses([]);
    } else {
      setAddresses((res.data as CustomerAddressRow[]) ?? []);
    }
    setLoading(false);
  }, [user?.id]);

  useEffect(() => {
    if (userLoading) return;
    void fetchAddresses();
  }, [userLoading, fetchAddresses]);

  const insertAddress = useCallback(
    async (input: CustomerAddressInput) => {
      if (!user?.id) return { ok: false as const, message: "Not signed in." };
      const sb = getSupabaseClient();
      if (!sb) return { ok: false as const, message: "Supabase is not configured." };
      const now = new Date().toISOString();
      const row = {
        user_id: user.id,
        label: input.label,
        line1: input.line1,
        suburb: input.suburb,
        city: input.city,
        postal_code: input.postal_code,
        is_default: input.is_default,
        updated_at: now,
      };
      if (input.is_default) {
        await sb.from("customer_saved_addresses").update({ is_default: false, updated_at: now }).eq("user_id", user.id);
      }
      const res = await sb.from("customer_saved_addresses").insert(row).select("id").single();
      if (res.error) return { ok: false as const, message: res.error.message };
      const id = typeof (res.data as { id?: string } | null)?.id === "string" ? (res.data as { id: string }).id : "";
      if (!id) return { ok: false as const, message: "Could not read new address id." };
      await fetchAddresses();
      return { ok: true as const, id };
    },
    [user?.id, fetchAddresses],
  );

  const updateAddress = useCallback(
    async (id: string, patch: Partial<Pick<CustomerAddressRow, "label" | "line1" | "suburb" | "city" | "postal_code" | "is_default">>) => {
      if (!user?.id) return { ok: false as const, message: "Not signed in." };
      const sb = getSupabaseClient();
      if (!sb) return { ok: false as const, message: "Supabase is not configured." };
      const now = new Date().toISOString();
      if (patch.is_default) {
        await sb.from("customer_saved_addresses").update({ is_default: false, updated_at: now }).eq("user_id", user.id);
      }
      const res = await sb
        .from("customer_saved_addresses")
        .update({ ...patch, updated_at: now })
        .eq("id", id)
        .eq("user_id", user.id)
        .select("*")
        .maybeSingle();
      if (res.error) return { ok: false as const, message: res.error.message };
      await fetchAddresses();
      return { ok: true as const };
    },
    [user?.id, fetchAddresses],
  );

  const deleteAddress = useCallback(
    async (id: string) => {
      if (!user?.id) return { ok: false as const, message: "Not signed in." };
      const sb = getSupabaseClient();
      if (!sb) return { ok: false as const, message: "Supabase is not configured." };
      const res = await sb.from("customer_saved_addresses").delete().eq("id", id).eq("user_id", user.id);
      if (res.error) return { ok: false as const, message: res.error.message };
      await fetchAddresses();
      return { ok: true as const };
    },
    [user?.id, fetchAddresses],
  );

  const setDefaultAddress = useCallback(
    async (id: string) => {
      return updateAddress(id, { is_default: true });
    },
    [updateAddress],
  );

  return {
    addresses,
    loading: userLoading || loading,
    error,
    refetch: fetchAddresses,
    insertAddress,
    updateAddress,
    deleteAddress,
    setDefaultAddress,
  };
}
