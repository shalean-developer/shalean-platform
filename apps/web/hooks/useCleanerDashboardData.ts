"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CleanerOfferRow } from "@/lib/cleaner/cleanerOfferRow";
import type { CleanerBookingRow } from "@/lib/cleaner/cleanerBookingRow";
import { cleanerAuthenticatedFetch } from "@/lib/cleaner/cleanerAuthenticatedFetch";
import { getCleanerAuthHeaders } from "@/lib/cleaner/cleanerClientHeaders";
import { buildCleanerOfferAcceptBody } from "@/lib/cleaner/cleanerOfferUxVariant";
import { getSupabaseBrowser } from "@/lib/supabase/browser";
import { formatZarFromCents } from "@/lib/cleaner/cleanerZarFormat";
import { mapOfferToDashboardCard } from "@/lib/cleaner-dashboard/mapOfferToDashboardCard";
import { buildDashboardUpcomingJobs } from "@/lib/cleaner-dashboard/dashboardUpcomingJobs";

type MeJson = {
  cleaner?: { id: string } | null;
  teamIds?: string[];
  error?: string;
};

function assertOnline(): { ok: true } | { ok: false; error: string } {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return { ok: false, error: "You appear offline. Reconnect, then try again." };
  }
  return { ok: true };
}

export function useCleanerDashboardData() {
  const [cleanerId, setCleanerId] = useState<string | null>(null);
  const [teamIds, setTeamIds] = useState<string[]>([]);
  const [offerRows, setOfferRows] = useState<CleanerOfferRow[]>([]);
  const [jobRows, setJobRows] = useState<CleanerBookingRow[]>([]);
  const [todayCents, setTodayCents] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actingOfferId, setActingOfferId] = useState<string | null>(null);
  const [actionBanner, setActionBanner] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [realtimeAuthEpoch, setRealtimeAuthEpoch] = useState(0);
  const loadSeq = useRef(0);
  const realtimeLoadDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const realtimeAuthDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleReload = useCallback((fn: () => void) => {
    if (realtimeLoadDebounceRef.current) clearTimeout(realtimeLoadDebounceRef.current);
    realtimeLoadDebounceRef.current = setTimeout(() => {
      realtimeLoadDebounceRef.current = null;
      fn();
    }, 350);
  }, []);

  const loadOffers = useCallback(async (headers: Record<string, string>) => {
    const res = await cleanerAuthenticatedFetch("/api/cleaner/offers", { headers });
    const j = (await res.json().catch(() => ({}))) as { offers?: CleanerOfferRow[]; error?: string };
    if (!res.ok) throw new Error(j.error ?? "Could not load offers.");
    setOfferRows(j.offers ?? []);
  }, []);

  const loadJobs = useCallback(async (headers: Record<string, string>) => {
    const res = await cleanerAuthenticatedFetch("/api/cleaner/jobs?assignments=direct", { headers });
    const j = (await res.json().catch(() => ({}))) as { jobs?: CleanerBookingRow[]; error?: string };
    if (!res.ok) throw new Error(j.error ?? "Could not load jobs.");
    setJobRows(j.jobs ?? []);
  }, []);

  const loadEarningsSummary = useCallback(async (headers: Record<string, string>) => {
    const res = await cleanerAuthenticatedFetch("/api/cleaner/earnings", { headers });
    const j = (await res.json().catch(() => ({}))) as {
      summary?: { today_cents?: number };
      error?: string;
    };
    if (!res.ok) {
      setTodayCents(null);
      return;
    }
    const c = j.summary?.today_cents;
    setTodayCents(typeof c === "number" && Number.isFinite(c) ? Math.max(0, Math.round(c)) : 0);
  }, []);

  const loadMe = useCallback(async (headers: Record<string, string>) => {
    const res = await cleanerAuthenticatedFetch("/api/cleaner/me", { headers });
    const j = (await res.json().catch(() => ({}))) as MeJson;
    if (!res.ok || !j.cleaner?.id) {
      setCleanerId(null);
      setTeamIds([]);
      throw new Error(j.error ?? "Could not load profile.");
    }
    setCleanerId(j.cleaner.id.trim());
    setTeamIds(
      Array.isArray(j.teamIds)
        ? j.teamIds.filter((x): x is string => typeof x === "string" && Boolean(x.trim()))
        : [],
    );
  }, []);

  const loadAll = useCallback(async () => {
    const headers = await getCleanerAuthHeaders();
    if (!headers) {
      setError("Not signed in.");
      setOfferRows([]);
      setJobRows([]);
      setCleanerId(null);
      setLoading(false);
      return;
    }
    const seq = ++loadSeq.current;
    try {
      await loadMe(headers);
      if (seq !== loadSeq.current) return;
      await Promise.all([loadOffers(headers), loadJobs(headers), loadEarningsSummary(headers)]);
      if (seq !== loadSeq.current) return;
      setError(null);
    } catch (e) {
      if (seq !== loadSeq.current) return;
      setError(e instanceof Error ? e.message : "Could not load dashboard.");
    } finally {
      if (seq === loadSeq.current) setLoading(false);
    }
  }, [loadEarningsSummary, loadJobs, loadMe, loadOffers]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  useEffect(() => {
    if (offerRows.length === 0) return;
    const id = window.setInterval(() => setTick((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, [offerRows.length]);

  useEffect(() => {
    const sb = getSupabaseBrowser();
    if (!sb) return;
    const {
      data: { subscription },
    } = sb.auth.onAuthStateChange((event) => {
      if (event !== "SIGNED_OUT" && event !== "SIGNED_IN" && event !== "USER_UPDATED") return;
      if (realtimeAuthDebounceRef.current) clearTimeout(realtimeAuthDebounceRef.current);
      realtimeAuthDebounceRef.current = setTimeout(() => {
        realtimeAuthDebounceRef.current = null;
        setRealtimeAuthEpoch((n) => n + 1);
      }, 220);
    });
    return () => {
      subscription.unsubscribe();
      if (realtimeAuthDebounceRef.current) clearTimeout(realtimeAuthDebounceRef.current);
    };
  }, []);

  useEffect(() => {
    const id = cleanerId?.trim();
    if (!id) return;
    const sb = getSupabaseBrowser();
    if (!sb) return;

    let cancelled = false;
    let chBookings: ReturnType<typeof sb.channel> | null = null;
    let chOffers: ReturnType<typeof sb.channel> | null = null;
    let chTeamMembers: ReturnType<typeof sb.channel> | null = null;

    void sb.auth.getSession().then(({ data: { session } }) => {
      if (cancelled || !session?.user) return;

      const reload = () => scheduleReload(() => void loadAll());

      chBookings = sb.channel(`cleaner-dashboard-bookings-${id}`);
      chBookings.on(
        "postgres_changes",
        { event: "*", schema: "public", table: "bookings", filter: `cleaner_id=eq.${id}` },
        reload,
      );
      for (const tid of teamIds) {
        const t = tid.trim();
        if (!t) continue;
        chBookings.on(
          "postgres_changes",
          { event: "*", schema: "public", table: "bookings", filter: `team_id=eq.${t}` },
          reload,
        );
      }
      chBookings.subscribe();

      chOffers = sb
        .channel(`cleaner-dashboard-offers-${id}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "dispatch_offers", filter: `cleaner_id=eq.${id}` },
          reload,
        )
        .subscribe();

      chTeamMembers = sb
        .channel(`cleaner-dashboard-team-${id}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "team_members", filter: `cleaner_id=eq.${id}` },
          reload,
        )
        .subscribe();
    });

    return () => {
      cancelled = true;
      if (realtimeLoadDebounceRef.current) {
        clearTimeout(realtimeLoadDebounceRef.current);
        realtimeLoadDebounceRef.current = null;
      }
      if (chBookings) void sb.removeChannel(chBookings);
      if (chOffers) void sb.removeChannel(chOffers);
      if (chTeamMembers) void sb.removeChannel(chTeamMembers);
    };
  }, [cleanerId, loadAll, scheduleReload, teamIds, realtimeAuthEpoch]);

  const now = useMemo(() => {
    void tick;
    return new Date();
  }, [tick]);

  const offerCards = useMemo(
    () => offerRows.map((o) => mapOfferToDashboardCard(o, now)),
    [offerRows, now],
  );

  const upcomingJobs = useMemo(() => buildDashboardUpcomingJobs(jobRows, now), [jobRows, now]);

  const earningsLabel = useMemo(() => {
    if (todayCents == null) return "—";
    return formatZarFromCents(todayCents);
  }, [todayCents]);

  const removeOfferLocal = useCallback((offerId: string) => {
    setOfferRows((prev) => prev.filter((x) => x.id !== offerId));
  }, []);

  const acceptOffer = useCallback(
    async (offerId: string, uxVariant: string | null) => {
      const online = assertOnline();
      if (!online.ok) {
        setActionBanner(online.error);
        return;
      }
      const headers = await getCleanerAuthHeaders();
      if (!headers) {
        setActionBanner("Not signed in.");
        return;
      }

      let snapshot: CleanerOfferRow | undefined;
      setOfferRows((prev) => {
        snapshot = prev.find((x) => x.id === offerId);
        return prev.filter((x) => x.id !== offerId);
      });
      setActingOfferId(offerId);
      setActionBanner(null);

      try {
        const res = await cleanerAuthenticatedFetch(`/api/cleaner/offers/${encodeURIComponent(offerId)}/accept`, {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify(buildCleanerOfferAcceptBody(uxVariant ?? snapshot?.ux_variant)),
        });
        const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; reason?: string };
        if (!res.ok) {
          if (snapshot) {
            const snap = snapshot;
            setOfferRows((prev) => (prev.some((x) => x.id === snap.id) ? prev : [...prev, snap]));
          }
          if (j.reason === "already_taken") {
            setActionBanner("Another cleaner took this job.");
          } else {
            setActionBanner(j.error ?? "Could not accept offer.");
          }
          return;
        }
        await Promise.all([loadOffers(headers), loadJobs(headers), loadEarningsSummary(headers)]);
      } catch {
        if (snapshot) {
          const snap = snapshot;
          setOfferRows((prev) => (prev.some((x) => x.id === snap.id) ? prev : [...prev, snap]));
        }
        setActionBanner("Network error.");
      } finally {
        setActingOfferId(null);
      }
    },
    [loadEarningsSummary, loadJobs, loadOffers],
  );

  const declineOffer = useCallback(
    async (offerId: string) => {
      const online = assertOnline();
      if (!online.ok) {
        setActionBanner(online.error);
        return;
      }
      const headers = await getCleanerAuthHeaders();
      if (!headers) {
        setActionBanner("Not signed in.");
        return;
      }

      let snapshot: CleanerOfferRow | undefined;
      setOfferRows((prev) => {
        snapshot = prev.find((x) => x.id === offerId);
        return prev.filter((x) => x.id !== offerId);
      });
      setActingOfferId(offerId);
      setActionBanner(null);

      try {
        const res = await cleanerAuthenticatedFetch(`/api/cleaner/offers/${encodeURIComponent(offerId)}/decline`, {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
        if (!res.ok) {
          if (snapshot) {
            const snap = snapshot;
            setOfferRows((prev) => (prev.some((x) => x.id === snap.id) ? prev : [...prev, snap]));
          }
          setActionBanner(j.error ?? "Could not decline offer.");
          return;
        }
        await Promise.all([loadOffers(headers), loadJobs(headers)]);
      } catch {
        if (snapshot) {
          const snap = snapshot;
          setOfferRows((prev) => (prev.some((x) => x.id === snap.id) ? prev : [...prev, snap]));
        }
        setActionBanner("Network error.");
      } finally {
        setActingOfferId(null);
      }
    },
    [loadJobs, loadOffers],
  );

  return {
    loading,
    error,
    actionBanner,
    dismissActionBanner: () => setActionBanner(null),
    offerCards,
    upcomingJobs,
    todayZarLabel: earningsLabel,
    acceptOffer,
    declineOffer,
    actingOfferId,
    removeOfferLocal,
    reload: loadAll,
  };
}
