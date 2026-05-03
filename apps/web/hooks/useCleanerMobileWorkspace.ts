"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CleanerBookingRow } from "@/lib/cleaner/cleanerBookingRow";
import { cleanerAuthenticatedFetch } from "@/lib/cleaner/cleanerAuthenticatedFetch";
import { getCleanerAuthHeaders } from "@/lib/cleaner/cleanerClientHeaders";
import { buildCleanerOfferAcceptBody } from "@/lib/cleaner/cleanerOfferUxVariant";
import type { CleanerOfferRow } from "@/lib/cleaner/cleanerOfferRow";
import { getActiveMobileJob, getNextUpcomingMobileJob } from "@/lib/cleaner/cleanerMobileBookingMap";
import { johannesburgCalendarYmd } from "@/lib/dashboard/johannesburgMonth";
import { sortCleanerOffersByAcceptanceScore } from "@/lib/cleaner/cleanerOfferAcceptanceRank";
import { mapCleanerMeToMobileProfile } from "@/lib/cleaner/cleanerMobileProfileFromMe";
import { setCleanerAvailability as patchCleanerAvailability } from "@/lib/cleaner/setCleanerAvailability";
import { getSupabaseBrowser } from "@/lib/supabase/browser";
import {
  trustJobCompletionFeedbackFromRow,
  type TrustJobCompletionFeedback,
} from "@/lib/cleaner/trustJobCompletionFeedback";

export type PostJobActionResult =
  | { ok: true; trustCompletion?: TrustJobCompletionFeedback }
  | { ok: false; error: string };

export type { TrustJobCompletionFeedback };

type MeCleaner = {
  id: string;
  full_name: string | null;
  phone?: string | null;
  phone_number?: string | null;
  email?: string | null;
  status?: string | null;
  is_available?: boolean | null;
  rating?: number | null;
  jobs_completed?: number | null;
  location?: string | null;
  created_at?: string | null;
  availability_weekdays?: string[] | null;
};

export type CleanerJobAction = "accept" | "reject" | "en_route" | "start" | "complete";

/** Alias for schedule/job list UIs (same values as {@link CleanerJobAction}). */
export type CleanerScheduleLifecycleAction = CleanerJobAction;

function assertOnline(): { ok: true } | { ok: false; error: string } {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return { ok: false, error: "You appear offline. Reconnect, then try again." };
  }
  return { ok: true };
}

export function useCleanerMobileWorkspace() {
  const [rows, setRows] = useState<CleanerBookingRow[]>([]);
  const [offers, setOffers] = useState<CleanerOfferRow[]>([]);
  const [cleaner, setCleaner] = useState<MeCleaner | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);
  const [offerActingId, setOfferActingId] = useState<string | null>(null);
  const [realtimeOk, setRealtimeOk] = useState(false);
  const [teamIdsForRealtime, setTeamIdsForRealtime] = useState<string[]>([]);
  const [online, setOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  /** Bumps on sign-out / sign-in / user swap so Realtime channels are torn down and re-bound. */
  const [realtimeAuthEpoch, setRealtimeAuthEpoch] = useState(0);
  const realtimeAuthDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadSeq = useRef(0);
  const realtimeLoadDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);

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

  const load = useCallback(async (): Promise<{ jobs: CleanerBookingRow[]; jobsOk: boolean } | null> => {
    const headers = await getCleanerAuthHeaders();
    if (!headers) {
      setError("Not signed in.");
      setRows([]);
      setOffers([]);
      setCleaner(null);
      setLoading(false);
      return null;
    }
    const seq = ++loadSeq.current;
    try {
      const [jobsRes, meRes, offersRes] = await Promise.all([
        cleanerAuthenticatedFetch("/api/cleaner/jobs", { headers }),
        cleanerAuthenticatedFetch("/api/cleaner/me", { headers }),
        cleanerAuthenticatedFetch("/api/cleaner/offers", { headers }),
      ]);
      if (seq !== loadSeq.current) return null;

      const j = (await jobsRes.json().catch(() => ({}))) as { jobs?: CleanerBookingRow[]; error?: string };
      const m = (await meRes.json().catch(() => ({}))) as { cleaner?: MeCleaner | null; teamIds?: string[]; error?: string };
      const o = (await offersRes.json().catch(() => ({}))) as { offers?: CleanerOfferRow[]; error?: string };

      const jobs = j.jobs ?? [];
      if (!jobsRes.ok) {
        setError(j.error ?? "Could not load jobs.");
        setRows([]);
      } else {
        setError(null);
        setRows(jobs);
      }
      setOffers(offersRes.ok ? (o.offers ?? []) : []);
      if (meRes.ok && m.cleaner) setCleaner(m.cleaner);
      setTeamIdsForRealtime(
        meRes.ok && Array.isArray(m.teamIds) ? m.teamIds.filter((x): x is string => typeof x === "string" && x.trim().length > 0) : [],
      );
      return { jobs: jobsRes.ok ? jobs : [], jobsOk: jobsRes.ok };
    } catch {
      if (seq !== loadSeq.current) return null;
      setError("Could not load workspace. Check your connection and try again.");
      setRows([]);
      setOffers([]);
      return { jobs: [], jobsOk: false };
    } finally {
      if (seq === loadSeq.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const t = window.setInterval(() => void load(), 25_000);
    return () => window.clearInterval(t);
  }, [load]);

  const scheduleRealtimeReload = useCallback(() => {
    if (realtimeLoadDebounceRef.current) clearTimeout(realtimeLoadDebounceRef.current);
    realtimeLoadDebounceRef.current = setTimeout(() => {
      realtimeLoadDebounceRef.current = null;
      void load();
    }, 400);
  }, [load]);

  useEffect(() => {
    if (!cleaner?.id) return;
    const sb = getSupabaseBrowser();
    /** DB `cleaners.id` — Realtime filters must use this, not Supabase auth uid. */
    const cleanerId = cleaner.id.trim();
    if (!sb || !cleanerId) return;

    let cancelled = false;
    let rtChannel: ReturnType<typeof sb.channel> | null = null;

    void sb.auth.getSession().then(({ data: { session } }) => {
      if (cancelled || !session?.user) return;

      const ch = sb.channel(`cleaner-mobile-rt-${cleanerId}`);
      ch.on(
        "postgres_changes",
        { event: "*", schema: "public", table: "bookings", filter: `cleaner_id=eq.${cleanerId}` },
        scheduleRealtimeReload,
      );
      ch.on(
        "postgres_changes",
        { event: "*", schema: "public", table: "bookings", filter: `payout_owner_cleaner_id=eq.${cleanerId}` },
        scheduleRealtimeReload,
      );
      for (const tid of teamIdsForRealtime) {
        if (!tid.trim()) continue;
        ch.on(
          "postgres_changes",
          { event: "*", schema: "public", table: "bookings", filter: `team_id=eq.${tid}` },
          scheduleRealtimeReload,
        );
      }
      ch.on(
        "postgres_changes",
        { event: "*", schema: "public", table: "dispatch_offers", filter: `cleaner_id=eq.${cleanerId}` },
        scheduleRealtimeReload,
      );
      ch.on(
        "postgres_changes",
        { event: "*", schema: "public", table: "team_members", filter: `cleaner_id=eq.${cleanerId}` },
        scheduleRealtimeReload,
      );
      ch.on(
        "postgres_changes",
        { event: "*", schema: "public", table: "booking_cleaners", filter: `cleaner_id=eq.${cleanerId}` },
        scheduleRealtimeReload,
      );
      rtChannel = ch;
      ch.subscribe((status) => {
        if (!cancelled) setRealtimeOk(status === "SUBSCRIBED");
      });
    });

    return () => {
      cancelled = true;
      if (realtimeLoadDebounceRef.current) {
        clearTimeout(realtimeLoadDebounceRef.current);
        realtimeLoadDebounceRef.current = null;
      }
      if (rtChannel) void sb.removeChannel(rtChannel);
    };
  }, [load, teamIdsForRealtime, cleaner?.id, realtimeAuthEpoch, scheduleRealtimeReload]);

  const postJobAction = useCallback(
    async (bookingId: string, action: CleanerJobAction): Promise<PostJobActionResult> => {
      const o = assertOnline();
      if (!o.ok) return { ok: false, error: o.error };
      const headers = await getCleanerAuthHeaders();
      if (!headers) return { ok: false, error: "Not signed in." };
      setActingId(bookingId);
      try {
        if (action === "accept" || action === "reject") {
          const res = await cleanerAuthenticatedFetch("/api/cleaner/respond", {
            method: "POST",
            headers: { ...headers, "Content-Type": "application/json" },
            body: JSON.stringify({
              bookingId,
              action,
              ...(cleaner?.id ? { cleanerId: cleaner.id } : {}),
            }),
          });
          const json = (await res.json()) as { ok?: boolean; error?: string };
          if (!res.ok) return { ok: false, error: json.error ?? "Action failed." };
          await load();
          return { ok: true };
        }

        const res = await cleanerAuthenticatedFetch(`/api/cleaner/jobs/${encodeURIComponent(bookingId)}`, {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        });
        const json = (await res.json()) as { ok?: boolean; error?: string };
        if (!res.ok) return { ok: false, error: json.error ?? "Action failed." };
        const payload = await load();
        if (action === "complete" && payload?.jobsOk) {
          const row = payload.jobs.find((x) => x.id === bookingId);
          if (row) return { ok: true, trustCompletion: trustJobCompletionFeedbackFromRow(row) };
        }
        return { ok: true };
      } catch {
        return { ok: false, error: "Network error." };
      } finally {
        setActingId(null);
      }
    },
    [load, cleaner?.id],
  );

  const respondToOffer = useCallback(
    async (offerId: string, action: "accept" | "decline", uxVariant?: string | null) => {
      const o = assertOnline();
      if (!o.ok) return o;
      const headers = await getCleanerAuthHeaders();
      if (!headers) return { ok: false as const, error: "Not signed in." };
      setOfferActingId(offerId);
      const resolvedUx = uxVariant ?? offers.find((x) => x.id === offerId)?.ux_variant;
      try {
        const res = await cleanerAuthenticatedFetch(`/api/cleaner/offers/${encodeURIComponent(offerId)}/${action}`, {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify(action === "accept" ? buildCleanerOfferAcceptBody(resolvedUx) : {}),
        });
        const json = (await res.json()) as { ok?: boolean; error?: string };
        if (!res.ok) return { ok: false as const, error: json.error ?? "Could not update offer." };
        await load();
        return { ok: true as const };
      } catch {
        return { ok: false as const, error: "Network error." };
      } finally {
        setOfferActingId(null);
      }
    },
    [load, offers],
  );

  const setAvailability = useCallback(async (next: boolean) => {
    const o = assertOnline();
    if (!o.ok) return o;
    const r = await patchCleanerAvailability(next);
    if (!r.ok) return r;
    setCleaner(r.cleaner as MeCleaner);
    return { ok: true as const };
  }, []);

  const activeJob = useMemo(() => getActiveMobileJob(rows), [rows]);
  const nextJob = useMemo(() => getNextUpcomingMobileJob(rows), [rows]);
  /** Dispatch offers only — team-assigned jobs never appear here (they live under My Jobs). */
  const availableOffers = useMemo(
    () => offers.filter((o) => o.booking == null || o.booking.is_team_job !== true),
    [offers],
  );
  const offerAcceptanceRankCtx = useMemo(
    () => ({
      now: new Date(),
      cleanerCreatedAtIso: cleaner?.created_at ?? null,
    }),
    [availableOffers, cleaner?.created_at],
  );
  const rankedSoloOffers = useMemo(
    () => sortCleanerOffersByAcceptanceScore(availableOffers, offerAcceptanceRankCtx),
    [availableOffers, offerAcceptanceRankCtx],
  );
  const topOffer = rankedSoloOffers[0] ?? null;
  const extraSoloOffersTodayCount = useMemo(() => {
    const y = johannesburgCalendarYmd(new Date());
    const n = rankedSoloOffers.filter((o) => String(o.booking?.date ?? "").slice(0, 10) === y).length;
    return Math.max(0, n - 1);
  }, [rankedSoloOffers]);

  const profile = useMemo(() => mapCleanerMeToMobileProfile(cleaner), [cleaner]);

  return {
    rows,
    offers,
    topOffer,
    rankedSoloOffers,
    extraSoloOffersTodayCount,
    loading,
    error,
    reload: load,
    actingId,
    offerActingId,
    postJobAction,
    respondToOffer,
    setAvailability,
    activeJob,
    nextJob,
    profile,
    realtimeOk,
    online,
  };
}
