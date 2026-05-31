"use client";

import type { User } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import { useUser } from "@/hooks/useUser";
import { getSupabaseClient } from "@/lib/supabaseClient";
import type { BookCustomerDetails } from "@/src/features/book/bookFlowTypes";

function detailsFromUser(user: User): Omit<BookCustomerDetails, "phone"> & { phone: string } {
  const meta = user.user_metadata as { full_name?: string; phone?: string } | undefined;
  return {
    fullName: meta?.full_name?.trim() ?? "",
    email: user.email?.trim() ?? "",
    phone: meta?.phone?.trim() ?? "",
  };
}

export function useBookCustomerProfile(): {
  customer: BookCustomerDetails | null;
  loading: boolean;
  refresh: () => Promise<void>;
} {
  const { user, loading: userLoading } = useUser();
  const [customer, setCustomer] = useState<BookCustomerDetails | null>(null);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    if (!user) {
      setCustomer(null);
      setLoading(false);
      return;
    }
    const sb = getSupabaseClient();
    const base = detailsFromUser(user);
    let fullName = base.fullName;
    let phone = base.phone;

    if (sb) {
      const { data: profile } = await sb
        .from("user_profiles")
        .select("full_name")
        .eq("id", user.id)
        .maybeSingle();
      const profileName =
        profile && typeof profile === "object" && "full_name" in profile
          ? String((profile as { full_name?: string | null }).full_name ?? "").trim()
          : "";
      if (profileName) fullName = profileName;

      if (!phone) {
        const { data: lastBooking } = await sb
          .from("bookings")
          .select("customer_phone")
          .eq("user_id", user.id)
          .not("customer_phone", "is", null)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        const bookingPhone =
          lastBooking && typeof lastBooking === "object" && "customer_phone" in lastBooking
            ? String((lastBooking as { customer_phone?: string | null }).customer_phone ?? "").trim()
            : "";
        if (bookingPhone) phone = bookingPhone;
      }
    }

    setCustomer({
      fullName,
      email: base.email,
      phone,
    });
    setLoading(false);
  }

  useEffect(() => {
    if (userLoading) return;
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refresh when auth user changes
  }, [user, userLoading]);

  return { customer, loading: userLoading || loading, refresh };
}
