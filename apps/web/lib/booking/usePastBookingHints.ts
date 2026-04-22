"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase/browser";
import { useAuth } from "@/lib/auth/useAuth";
import type { BookingSnapshotV1 } from "@/lib/booking/paystackChargeTypes";
import type { PastBookingHint } from "@/lib/ai/bookingAssistant";

/**
 * Loads recent bookings for the signed-in user to personalize slot/extra suggestions.
 */
export function usePastBookingHints(): PastBookingHint[] {
  const { user } = useAuth();
  const [hints, setHints] = useState<PastBookingHint[]>([]);

  useEffect(() => {
    if (!user?.id) {
      setHints([]);
      return;
    }

    const sb = getSupabaseBrowser();
    if (!sb) {
      setHints([]);
      return;
    }

    let cancelled = false;
    void sb
      .from("bookings")
      .select("time, booking_snapshot, date")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(5)
      .then(({ data, error }) => {
        if (cancelled || error || !data?.length) {
          if (!cancelled) setHints([]);
          return;
        }
        const out: PastBookingHint[] = [];
        for (const row of data) {
          const time = typeof row.time === "string" ? row.time : null;
          const dateYmd = typeof row.date === "string" ? row.date : null;
          const snap = row.booking_snapshot as BookingSnapshotV1 | null;
          const extras = snap?.locked?.extras;
          out.push({
            time,
            dateYmd,
            extras: Array.isArray(extras) ? extras : [],
          });
        }
        if (!cancelled) setHints(out);
      });

    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  return hints;
}
