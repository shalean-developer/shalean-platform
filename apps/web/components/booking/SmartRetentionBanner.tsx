"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase/browser";
import { useAuth } from "@/lib/auth/useAuth";
import { normalizeEmail } from "@/lib/booking/normalizeEmail";

type Hint =
  | { kind: "welcome" }
  | { kind: "returning" }
  | { kind: "churn"; daysSince: number }
  | null;

/**
 * First-time / returning / churn messaging. Churn uses last `bookings.created_at` for the signed-in email.
 */
export function SmartRetentionBanner() {
  const { user, loading: authLoading } = useAuth();
  const [hint, setHint] = useState<Hint>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!user?.email) {
      setHint({ kind: "welcome" });
      setLoading(false);
      return;
    }

    let cancelled = false;
    const sb = getSupabaseBrowser();
    if (!sb) {
      setHint(null);
      setLoading(false);
      return;
    }

    void (async () => {
      const email = normalizeEmail(user.email ?? "");
      const { data: profile } = await sb.from("user_profiles").select("booking_count").eq("id", user.id).maybeSingle();
      const count =
        profile && typeof profile === "object" && "booking_count" in profile
          ? Number((profile as { booking_count: number }).booking_count)
          : 0;

      if (cancelled) return;

      if (!count || count < 1) {
        setHint({ kind: "welcome" });
        setLoading(false);
        return;
      }

      const { data: lastRows } = await sb
        .from("bookings")
        .select("created_at")
        .eq("customer_email", email)
        .order("created_at", { ascending: false })
        .limit(1);

      const last = Array.isArray(lastRows) && lastRows[0] && typeof lastRows[0] === "object" && "created_at" in lastRows[0]
        ? String((lastRows[0] as { created_at: string }).created_at)
        : null;

      if (last) {
        const daysSince = Math.floor((Date.now() - Date.parse(last)) / (24 * 60 * 60 * 1000));
        if (daysSince >= 30) {
          setHint({ kind: "churn", daysSince });
          setLoading(false);
          return;
        }
      }

      setHint({ kind: "returning" });
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [authLoading, user]);

  if (loading || !hint) return null;

  if (hint.kind === "welcome") {
    return (
      <div className="mb-4 rounded-xl border border-emerald-200/90 bg-emerald-50/95 px-4 py-3 text-sm text-emerald-950 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-50">
        <strong>Welcome!</strong> Get 10% off your first clean — use code <span className="font-mono font-semibold">SAVE10</span> at
        payment.
      </div>
    );
  }

  if (hint.kind === "returning") {
    return (
      <div className="mb-4 rounded-xl border border-sky-200/90 bg-sky-50/95 px-4 py-3 text-sm text-sky-950 dark:border-sky-900/50 dark:bg-sky-950/40 dark:text-sky-50">
        <strong>Welcome back</strong> — book again in seconds with your saved details.
      </div>
    );
  }

  return (
    <div className="mb-4 rounded-xl border border-violet-200/90 bg-violet-50/95 px-4 py-3 text-sm text-violet-950 dark:border-violet-900/50 dark:bg-violet-950/40 dark:text-violet-50">
      We miss you ({hint.daysSince}+ days since your last clean) — here&apos;s <strong>R50 off</strong> with code{" "}
      <span className="font-mono font-semibold">WELCOME50</span> on your next clean.
    </div>
  );
}
