"use client";

import { useEffect, useRef } from "react";
import { getSupabaseBrowser } from "@/lib/supabase/browser";

const DEBOUNCE_MS = 400;

/**
 * Live updates for `/account/recurring` when `recurring_bookings` rows change for this customer.
 * Requires DB: `recurring_bookings` in `supabase_realtime` publication + SELECT RLS for `customer_id = auth.uid()`.
 */
export function useCustomerRecurringRealtime(
  customerId: string | null | undefined,
  onSilentRefetch: () => void | Promise<void>,
) {
  const debounceRef = useRef<number | null>(null);
  const refetchRef = useRef(onSilentRefetch);

  useEffect(() => {
    refetchRef.current = onSilentRefetch;
  }, [onSilentRefetch]);

  useEffect(() => {
    const uid = customerId?.trim();
    if (!uid) return;

    const sb = getSupabaseBrowser();
    if (!sb) return;

    const schedule = () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
      debounceRef.current = window.setTimeout(() => {
        debounceRef.current = null;
        void refetchRef.current();
      }, DEBOUNCE_MS);
    };

    const channel = sb
      .channel(`customer-recurring-${uid}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "recurring_bookings",
          filter: `customer_id=eq.${uid}`,
        },
        schedule,
      )
      .subscribe();

    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
      void sb.removeChannel(channel);
    };
  }, [customerId]);
}
