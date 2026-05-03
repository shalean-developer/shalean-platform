"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CleanerOfferRow } from "@/lib/cleaner/cleanerOfferRow";
import type { CleanerBookingRow } from "@/lib/cleaner/cleanerBookingRow";
import { cleanerAuthenticatedFetch } from "@/lib/cleaner/cleanerAuthenticatedFetch";
import { getCleanerAuthHeaders } from "@/lib/cleaner/cleanerClientHeaders";
import { buildCleanerOfferAcceptBody } from "@/lib/cleaner/cleanerOfferUxVariant";
import { getSupabaseBrowser } from "@/lib/supabase/browser";
import { formatZarFromCents } from "@/lib/cleaner/cleanerZarFormat";
import { mapOfferToDashboardCard } from "@/lib/cleaner-dashboard/mapOfferToDashboardCard";
import {
  buildDashboardUpcomingJobs,
  cleanerBookingRowToUpcomingJob,
} from "@/lib/cleaner-dashboard/dashboardUpcomingJobs";
import { compareCleanerBookingStartJohannesburg } from "@/lib/cleaner/cleanerUpcomingScheduleJohannesburg";
import { deriveCleanerJobUiState, mobilePhaseDisplayForDashboard } from "@/lib/cleaner/cleanerMobileBookingMap";
import { getJhbTodayRange } from "@/lib/dashboard/johannesburgMonth";
import type { CleanerDashboardTodayBreakdownItem } from "@/lib/cleaner/cleanerDashboardTodayCents";
import type { CleanerMeRow } from "@/lib/cleaner/cleanerMobileProfileFromMe";
import { cleanerWorksOnScheduledWeekday } from "@/lib/cleaner/availabilityWeekdays";
import { cleanerDisplayFirstName } from "@/lib/cleaner/cleanerDisplayFirstName";
import { resolveCleanerEarningsCents } from "@/lib/cleaner/resolveCleanerEarnings";
import { setCleanerAvailability } from "@/lib/cleaner/setCleanerAvailability";
import { jobStartMsJohannesburg } from "@/lib/cleaner/jobStartJohannesburgMs";
import { CLEANER_DASHBOARD_JOBS_REFRESH_EVENT, writeCleanerDashboardCache } from "@/lib/cleaner/cleanerDashboardSessionCache";
import { useCleanerRealtime } from "@/lib/realtime/useCleanerRealtime";
import { hrefForNotificationKind } from "@/lib/notifications/notificationRoutes";
import { useCleanerNotifications } from "@/lib/notifications/notificationsStore";
import { wireBrowserNotificationClick } from "@/lib/notifications/wireBrowserNotification";

type MeJson = {
  cleaner?: CleanerMeRow | null;
  teamIds?: string[];
  completion_pct?: number | null;
  error?: string;
};

type CleanerDashboardWireJson = {
  jobs?: CleanerBookingRow[];
  summary?: {
    today_cents?: number;
    today_breakdown?: CleanerDashboardTodayBreakdownItem[];
    suggested_daily_goal_cents?: number;
    server_now_ms?: number;
    earnings_timezone?: string;
  };
};

export type ActivityFeedKind = "success" | "info" | "warning" | "offer";
type ActivityFeedEntry = { id: string; text: string; ts: number; kind: ActivityFeedKind };

function formatActivityClock(ts: number): string {
  try {
    return new Intl.DateTimeFormat("en-ZA", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Africa/Johannesburg",
    }).format(new Date(ts));
  } catch {
    return "";
  }
}

function assertOnline(): { ok: true } | { ok: false; error: string } {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return { ok: false, error: "You appear offline. Reconnect, then try again." };
  }
  return { ok: true };
}

export function useCleanerDashboardData() {
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const { addNotification } = useCleanerNotifications();
  const [cleanerId, setCleanerId] = useState<string | null>(null);
  const [teamIds, setTeamIds] = useState<string[]>([]);
  const [offerRows, setOfferRows] = useState<CleanerOfferRow[]>([]);
  const [jobRows, setJobRows] = useState<CleanerBookingRow[]>([]);
  const [todayCents, setTodayCents] = useState<number | null>(null);
  const [dailyGoalCents, setDailyGoalCents] = useState(40_000);
  const [todayBreakdown, setTodayBreakdown] = useState<CleanerDashboardTodayBreakdownItem[]>([]);
  const [cleanerMe, setCleanerMe] = useState<CleanerMeRow | null>(null);
  const [completionPct, setCompletionPct] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actingOfferId, setActingOfferId] = useState<string | null>(null);
  const [actionBanner, setActionBanner] = useState<string | null>(null);
  const [availabilityBusy, setAvailabilityBusy] = useState(false);
  const [browserOnline, setBrowserOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  const [tick, setTick] = useState(0);
  /** `server_now_ms` from API minus local `Date.now()` at receive time — stabilizes urgency countdowns. */
  const [serverClockOffsetMs, setServerClockOffsetMs] = useState(0);
  const [realtimeAuthEpoch, setRealtimeAuthEpoch] = useState(0);
  /** Bumped by {@link useCleanerRealtime} when work-settings tables change (admin approval, areas, calendar). */
  const [workSettingsRealtimeTick, setWorkSettingsRealtimeTick] = useState(0);
  const loadSeq = useRef(0);
  const dashboardRequestId = useRef(0);
  const offersRequestId = useRef(0);
  const meRequestId = useRef(0);
  const cleanerMeRef = useRef<CleanerMeRow | null>(null);
  const [receivingOptimistic, setReceivingOptimistic] = useState<boolean | null>(null);
  const [notificationToast, setNotificationToast] = useState<string | null>(null);
  const [activityFeed, setActivityFeed] = useState<ActivityFeedEntry[]>([]);
  const [notificationPermission, setNotificationPermission] = useState<"default" | "granted" | "denied" | "unsupported">(
    "unsupported",
  );
  const dashboardRtTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const offersRtTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const teamRtTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const realtimeAuthDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Previous pathname — detect return from job detail so dashboard jobs refetch (accept state). */
  const prevPathnameRef = useRef<string | null>(null);

  useEffect(() => {
    const up = () => setBrowserOnline(true);
    const down = () => setBrowserOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);

  useEffect(() => {
    cleanerMeRef.current = cleanerMe;
  }, [cleanerMe]);

  const pushActivityFeed = useCallback((idPrefix: string, text: string, kind: ActivityFeedKind) => {
    setActivityFeed((prev) => {
      const entry: ActivityFeedEntry = {
        id: `${idPrefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
        text,
        ts: Date.now(),
        kind,
      };
      return [entry, ...prev].slice(0, 14);
    });
  }, []);

  const prevBrowserOnline = useRef(browserOnline);
  useEffect(() => {
    const prev = prevBrowserOnline.current;
    prevBrowserOnline.current = browserOnline;
    if (prev && !browserOnline) {
      pushActivityFeed("net-down", "You're offline — reconnect to stay synced.", "warning");
    }
    if (!prev && browserOnline) {
      pushActivityFeed("net-up", "You're back online.", "success");
    }
  }, [browserOnline, pushActivityFeed]);

  useEffect(() => {
    if (typeof window === "undefined" || typeof Notification === "undefined") {
      setNotificationPermission("unsupported");
      return;
    }
    const sync = () => {
      setNotificationPermission(Notification.permission === "denied" ? "denied" : Notification.permission === "granted" ? "granted" : "default");
    };
    sync();
    const onVis = () => {
      if (document.visibilityState === "visible") sync();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  const loadOffers = useCallback(async (headers: Record<string, string>) => {
    const reqId = ++offersRequestId.current;
      const res = await cleanerAuthenticatedFetch("/api/cleaner/offers", { headers, cache: "no-store" });
    const j = (await res.json().catch(() => ({}))) as { offers?: CleanerOfferRow[]; error?: string };
    if (reqId !== offersRequestId.current) return;
    if (!res.ok) throw new Error(j.error ?? "Could not load offers.");
    setOfferRows(j.offers ?? []);
  }, []);

  const applyDashboardFromResponse = useCallback((j: CleanerDashboardWireJson) => {
    if (Array.isArray(j.jobs)) setJobRows(j.jobs);
    const c = j.summary?.today_cents;
    if (typeof c === "number" && Number.isFinite(c)) {
      setTodayCents(Math.max(0, Math.round(c)));
    }
    const g = j.summary?.suggested_daily_goal_cents;
    if (typeof g === "number" && Number.isFinite(g) && g > 0) {
      setDailyGoalCents(Math.max(40_000, Math.round(g)));
    }
    if (j.summary) {
      const br = j.summary.today_breakdown;
      setTodayBreakdown(
        Array.isArray(br)
          ? br.filter(
              (x): x is CleanerDashboardTodayBreakdownItem =>
                Boolean(x) &&
                typeof (x as CleanerDashboardTodayBreakdownItem).booking_id === "string" &&
                typeof (x as CleanerDashboardTodayBreakdownItem).cents === "number",
            )
          : [],
      );
    }
    const sn = j.summary?.server_now_ms;
    if (typeof sn === "number" && Number.isFinite(sn)) {
      setServerClockOffsetMs(sn - Date.now());
    }
  }, []);

  const loadDashboard = useCallback(
    async (headers: Record<string, string>) => {
      const reqId = ++dashboardRequestId.current;
      const res = await cleanerAuthenticatedFetch("/api/cleaner/dashboard", { headers, cache: "no-store" });
      const j = (await res.json().catch(() => ({}))) as CleanerDashboardWireJson & { error?: string };
      if (reqId !== dashboardRequestId.current) return;
      if (!res.ok) throw new Error(j.error ?? "Could not load dashboard.");
      applyDashboardFromResponse(j);
      const id = cleanerMeRef.current?.id?.trim();
      if (id) {
        writeCleanerDashboardCache(id, { jobs: j.jobs ?? [], summary: j.summary });
      }
    },
    [applyDashboardFromResponse],
  );

  const loadMe = useCallback(async (headers: Record<string, string>): Promise<string | null> => {
    const reqId = ++meRequestId.current;
    const res = await cleanerAuthenticatedFetch("/api/cleaner/me", { headers });
    if (reqId !== meRequestId.current) return null;
    const j = (await res.json().catch(() => ({}))) as MeJson;
    if (reqId !== meRequestId.current) return null;
    if (!res.ok || !j.cleaner?.id) {
      setCleanerId(null);
      setTeamIds([]);
      setCleanerMe(null);
      cleanerMeRef.current = null;
      setCompletionPct(null);
      throw new Error(j.error ?? "Could not load profile.");
    }
    const cleaner = j.cleaner;
    const cid = cleaner.id.trim();
    setCleanerMe(cleaner);
    cleanerMeRef.current = cleaner;
    const cp = j.completion_pct;
    setCompletionPct(typeof cp === "number" && Number.isFinite(cp) ? Math.min(100, Math.max(0, Math.round(cp))) : null);
    setCleanerId(cid);
    setTeamIds(
      Array.isArray(j.teamIds)
        ? j.teamIds.filter((x): x is string => typeof x === "string" && Boolean(x.trim()))
        : [],
    );
    return cid;
  }, []);

  const loadAll = useCallback(async () => {
    const headers = await getCleanerAuthHeaders();
    if (!headers) {
      setError("Not signed in.");
      setOfferRows([]);
      setJobRows([]);
      setCleanerId(null);
      setCleanerMe(null);
      cleanerMeRef.current = null;
      setCompletionPct(null);
      setLoading(false);
      return;
    }
    const seq = ++loadSeq.current;
    try {
      const cid = await loadMe(headers);
      if (seq !== loadSeq.current) return;
      await Promise.all([loadOffers(headers), loadDashboard(headers)]);
      if (seq !== loadSeq.current) return;
      setError(null);
    } catch (e) {
      if (seq !== loadSeq.current) return;
      setError(e instanceof Error ? e.message : "Could not load dashboard.");
    } finally {
      if (seq === loadSeq.current) setLoading(false);
    }
  }, [applyDashboardFromResponse, loadDashboard, loadMe, loadOffers]);

  const refetchDashboardOnly = useCallback(async () => {
    const headers = await getCleanerAuthHeaders();
    if (!headers) return;
    try {
      await loadDashboard(headers);
    } catch {
      /* realtime refresh — avoid clobbering loadSeq used by loadAll */
    }
  }, [loadDashboard]);

  const refetchOffersOnly = useCallback(async () => {
    const headers = await getCleanerAuthHeaders();
    if (!headers) return;
    try {
      await loadOffers(headers);
    } catch {
      /* ignore */
    }
  }, [loadOffers]);

  useEffect(() => {
    const id = cleanerId?.trim();
    if (!id) return;
    const refresh = () => {
      void refetchDashboardOnly();
      void refetchOffersOnly();
    };
    const onVis = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVis);
    const interval = window.setInterval(refresh, 45_000);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.clearInterval(interval);
    };
  }, [cleanerId, refetchDashboardOnly, refetchOffersOnly]);

  const bumpWorkSettingsRealtime = useCallback(() => {
    setWorkSettingsRealtimeTick((n) => n + 1);
  }, []);

  useCleanerRealtime({
    cleanerId,
    debounceMs: 300,
    subscribeBookings: false,
    subscribeWorkSettings: true,
    onWorkSettingsChange: bumpWorkSettingsRealtime,
  });

  const refetchMeTeamsAndDashboard = useCallback(async () => {
    const headers = await getCleanerAuthHeaders();
    if (!headers) return;
    try {
      await loadMe(headers);
      await Promise.all([loadDashboard(headers), loadOffers(headers)]);
    } catch {
      /* ignore */
    }
  }, [loadDashboard, loadMe, loadOffers]);

  const bumpDashboardRealtime = useCallback(() => {
    if (dashboardRtTimerRef.current) clearTimeout(dashboardRtTimerRef.current);
    dashboardRtTimerRef.current = setTimeout(() => {
      dashboardRtTimerRef.current = null;
      void refetchDashboardOnly();
    }, 300);
  }, [refetchDashboardOnly]);

  const bumpOffersRealtime = useCallback(() => {
    if (offersRtTimerRef.current) clearTimeout(offersRtTimerRef.current);
    offersRtTimerRef.current = setTimeout(() => {
      offersRtTimerRef.current = null;
      void refetchOffersOnly();
    }, 300);
  }, [refetchOffersOnly]);

  const bumpTeamRealtime = useCallback(() => {
    if (teamRtTimerRef.current) clearTimeout(teamRtTimerRef.current);
    teamRtTimerRef.current = setTimeout(() => {
      teamRtTimerRef.current = null;
      void refetchMeTeamsAndDashboard();
    }, 320);
  }, [refetchMeTeamsAndDashboard]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  useEffect(() => {
    const id = cleanerId?.trim();
    if (!id) return;
    const prev = prevPathnameRef.current;
    prevPathnameRef.current = pathname;
    const onDashboard = pathname === "/cleaner/dashboard";
    const cameFromJobsArea = Boolean(prev && prev !== pathname && prev.startsWith("/cleaner/jobs"));
    if (onDashboard && cameFromJobsArea) {
      void refetchDashboardOnly();
    }
  }, [pathname, cleanerId, refetchDashboardOnly]);

  useEffect(() => {
    const onJobsRefresh = () => {
      void refetchDashboardOnly();
    };
    window.addEventListener(CLEANER_DASHBOARD_JOBS_REFRESH_EVENT, onJobsRefresh);
    return () => window.removeEventListener(CLEANER_DASHBOARD_JOBS_REFRESH_EVENT, onJobsRefresh);
  }, [refetchDashboardOnly]);

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
    /** One multiplexed channel — fewer subscribe/teardown cycles than four channels (less noisy with HMR). */
    let rtChannel: ReturnType<typeof sb.channel> | null = null;

    void sb.auth.getSession().then(({ data: { session } }) => {
      if (cancelled || !session?.user) return;

      const reloadJobsAndEarnings = () => bumpDashboardRealtime();
      const reloadOffers = () => bumpOffersRealtime();
      const reloadTeamsScope = () => bumpTeamRealtime();

      const ch = sb.channel(`cleaner-dashboard-rt-${id}`);
      ch.on(
        "postgres_changes",
        { event: "*", schema: "public", table: "bookings", filter: `cleaner_id=eq.${id}` },
        reloadJobsAndEarnings,
      );
      ch.on(
        "postgres_changes",
        { event: "*", schema: "public", table: "bookings", filter: `payout_owner_cleaner_id=eq.${id}` },
        reloadJobsAndEarnings,
      );
      for (const tid of teamIds) {
        const t = tid.trim();
        if (!t) continue;
        ch.on(
          "postgres_changes",
          { event: "*", schema: "public", table: "bookings", filter: `team_id=eq.${t}` },
          reloadJobsAndEarnings,
        );
      }
      ch.on(
        "postgres_changes",
        { event: "*", schema: "public", table: "dispatch_offers", filter: `cleaner_id=eq.${id}` },
        reloadOffers,
      );
      ch.on(
        "postgres_changes",
        { event: "*", schema: "public", table: "team_members", filter: `cleaner_id=eq.${id}` },
        reloadTeamsScope,
      );
      ch.on(
        "postgres_changes",
        { event: "*", schema: "public", table: "booking_cleaners", filter: `cleaner_id=eq.${id}` },
        reloadJobsAndEarnings,
      );
      rtChannel = ch;
      ch.subscribe();
    });

    return () => {
      cancelled = true;
      if (dashboardRtTimerRef.current) {
        clearTimeout(dashboardRtTimerRef.current);
        dashboardRtTimerRef.current = null;
      }
      if (offersRtTimerRef.current) {
        clearTimeout(offersRtTimerRef.current);
        offersRtTimerRef.current = null;
      }
      if (teamRtTimerRef.current) {
        clearTimeout(teamRtTimerRef.current);
        teamRtTimerRef.current = null;
      }
      if (rtChannel) void sb.removeChannel(rtChannel);
    };
  }, [
    bumpDashboardRealtime,
    bumpOffersRealtime,
    bumpTeamRealtime,
    cleanerId,
    teamIds,
    realtimeAuthEpoch,
  ]);

  const jhbClock = useMemo(() => {
    void tick;
    const now = new Date();
    return { now, todayYmd: getJhbTodayRange(now).todayYmd };
  }, [tick]);

  const offerCards = useMemo(
    () => offerRows.map((o) => mapOfferToDashboardCard(o, jhbClock.now)),
    [offerRows, jhbClock.now],
  );

  const upcomingJobs = useMemo(
    () => buildDashboardUpcomingJobs(jobRows, jhbClock.now, jhbClock.todayYmd),
    [jobRows, jhbClock.now, jhbClock.todayYmd],
  );

  const earningsLabel = useMemo(() => {
    if (todayCents == null) return "—";
    return formatZarFromCents(todayCents);
  }, [todayCents]);

  const firstName = useMemo(() => cleanerDisplayFirstName(cleanerMe?.full_name), [cleanerMe?.full_name]);

  const performanceMetrics = useMemo(() => {
    const jc = cleanerMe?.jobs_completed;
    const jobsCompleted = typeof jc === "number" && Number.isFinite(jc) ? Math.max(0, Math.round(jc)) : null;
    const rt = cleanerMe?.rating;
    const rating = typeof rt === "number" && Number.isFinite(rt) ? rt : null;
    return { jobsCompleted, rating, completionPct };
  }, [cleanerMe?.jobs_completed, cleanerMe?.rating, completionPct]);

  const serverReceivingOffers = useMemo(() => {
    if (!cleanerMe) return false;
    return cleanerMe.is_available === true || String(cleanerMe.status ?? "").toLowerCase() === "available";
  }, [cleanerMe]);

  const receivingOffers = receivingOptimistic ?? serverReceivingOffers;

  const prevRecvOffers = useRef<boolean | undefined>(undefined);
  useEffect(() => {
    const prev = prevRecvOffers.current;
    prevRecvOffers.current = receivingOffers;
    if (!browserOnline) return;
    if (prev === false && receivingOffers === true) {
      pushActivityFeed("avail", "You're now available — looking for jobs near you.", "success");
    }
    if (prev === true && receivingOffers === false) {
      pushActivityFeed("paused", "You paused offers — go online from home when you're ready.", "info");
    }
  }, [browserOnline, receivingOffers, pushActivityFeed]);

  const prevOfferLen = useRef(0);
  const prevOfferIdsRef = useRef<Set<string>>(new Set());
  const offersFeedHydrated = useRef(false);
  useEffect(() => {
    if (loading) return;
    if (!offersFeedHydrated.current) {
      offersFeedHydrated.current = true;
      prevOfferLen.current = offerRows.length;
      prevOfferIdsRef.current = new Set(offerRows.map((o) => o.id));
      return;
    }
    const currentIds = new Set(offerRows.map((o) => o.id));
    const newOffers = offerRows.filter((o) => !prevOfferIdsRef.current.has(o.id));
    prevOfferIdsRef.current = currentIds;

    const n = offerRows.length;
    /** Skip only a large first hydration burst (e.g. replay); still notify for the first single offer `[] → [a]`. */
    const isInitialBulkSnapshot =
      prevOfferIdsRef.current.size === 0 &&
      newOffers.length === offerRows.length &&
      offerRows.length > 2;
    if (isInitialBulkSnapshot) {
      prevOfferLen.current = n;
      return;
    }

    if (browserOnline && receivingOffers && newOffers.length > 0) {
      const d = newOffers.length;
      pushActivityFeed(
        "offers",
        d === 1 ? "New job offer received — review below." : `${d} new offers — review below.`,
        "offer",
      );
      for (const o of newOffers) {
        const token = String(o.offer_token ?? "").trim();
        addNotification({
          title: "New job offer",
          body: token ? "Tap to review and accept this job." : "Review and accept from the offers section on your dashboard.",
          kind: "job_offer",
          booking_id: o.booking_id,
          offer_token: token || undefined,
          dedupe_key: `job_offer_row:${o.id}`,
        });
      }
      if (notificationPermission === "granted" && typeof Notification !== "undefined") {
        try {
          const bn = new Notification(d === 1 ? "New job offer" : `${d} new offers`, {
            body: "Tap to open your offer.",
            tag: "shalean-cleaner-offer",
          });
          const firstTok = String(newOffers[0]?.offer_token ?? "").trim();
          wireBrowserNotificationClick(
            bn,
            hrefForNotificationKind("job_offer", newOffers[0]?.booking_id ?? null, firstTok || null),
            (h) => router.push(h),
          );
        } catch {
          /* ignore */
        }
      }
    }
    prevOfferLen.current = n;
  }, [
    loading,
    offerRows,
    browserOnline,
    receivingOffers,
    pushActivityFeed,
    addNotification,
    notificationPermission,
    router,
  ]);

  const rosterIncludesToday = useMemo(
    () => cleanerWorksOnScheduledWeekday(cleanerMe?.availability_weekdays, jhbClock.todayYmd),
    [cleanerMe?.availability_weekdays, jhbClock.todayYmd],
  );

  const { potentialNextJobZarLabel, potentialRangeZarLabel } = useMemo(() => {
    if (todayCents == null || todayCents > 0) return { potentialNextJobZarLabel: null as string | null, potentialRangeZarLabel: null as string | null };
    const ymd = jhbClock.todayYmd;
    const open = jobRows.filter((r) => {
      const d = String(r.date ?? "").slice(0, 10);
      const st = String(r.status ?? "").toLowerCase();
      return d === ymd && st !== "completed" && st !== "cancelled";
    });
    const centsList: number[] = [];
    for (const pick of open) {
      const raw = pick as CleanerBookingRow & { display_earnings_cents?: number | null };
      const cents =
        resolveCleanerEarningsCents({
          cleaner_earnings_total_cents: pick.cleaner_earnings_total_cents,
          payout_frozen_cents: pick.payout_frozen_cents,
          display_earnings_cents: raw.display_earnings_cents ?? null,
        }) ?? 0;
      if (cents > 0) centsList.push(cents);
    }
    if (centsList.length === 0) return { potentialNextJobZarLabel: null, potentialRangeZarLabel: null };
    const min = Math.min(...centsList);
    const max = Math.max(...centsList);
    if (min === max) return { potentialNextJobZarLabel: formatZarFromCents(min), potentialRangeZarLabel: null };
    return {
      potentialNextJobZarLabel: null,
      potentialRangeZarLabel: `${formatZarFromCents(min)}–${formatZarFromCents(max)}`,
    };
  }, [todayCents, jobRows, jhbClock.todayYmd]);

  const earningsMotivationLine = useMemo(() => {
    if (todayCents == null || todayCents > 0) return null;
    if (potentialNextJobZarLabel || potentialRangeZarLabel) return null;
    return "You haven't completed any jobs yet today. Complete a job to start earning.";
  }, [todayCents, potentialNextJobZarLabel, potentialRangeZarLabel]);

  const earningsForwardLine = useMemo(() => {
    if (todayCents == null || todayCents > 0) return null;
    if (potentialNextJobZarLabel || potentialRangeZarLabel) return null;
    if (earningsMotivationLine) return null;
    if (browserOnline && receivingOffers) return "Stay online — jobs are being matched nearby.";
    return "Go online when you're ready to start earning.";
  }, [todayCents, potentialNextJobZarLabel, potentialRangeZarLabel, earningsMotivationLine, browserOnline, receivingOffers]);

  const earningsSnapshot = useMemo(
    () => ({
      todayZarLabel: earningsLabel,
      todayBreakdown,
      showZeroEarningsHint: todayCents !== null && todayCents === 0,
      earningsMotivationLine,
      potentialNextJobZarLabel,
      potentialRangeZarLabel,
      todayCentsValue: todayCents,
      dailyGoalCents,
      earningsForwardLine,
    }),
    [
      earningsLabel,
      todayBreakdown,
      todayCents,
      earningsMotivationLine,
      potentialNextJobZarLabel,
      potentialRangeZarLabel,
      dailyGoalCents,
      earningsForwardLine,
    ],
  );

  const activityFeedDisplay = useMemo(
    () =>
      [...activityFeed]
        .sort((a, b) => b.ts - a.ts)
        .slice(0, 6)
        .map((e) => ({
          id: e.id,
          text: e.text,
          timeLabel: formatActivityClock(e.ts),
          kind: e.kind,
        })),
    [activityFeed],
  );

  const onNotificationsGranted = useCallback(() => {
    setNotificationToast("Notifications enabled — we'll alert you instantly when new jobs arrive.");
    setNotificationPermission("granted");
    try {
      if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        const bn = new Notification("Notifications enabled", {
          body: "We’ll alert you when new job offers arrive.",
        });
        wireBrowserNotificationClick(bn, hrefForNotificationKind("system"), (h) => router.push(h));
      }
    } catch {
      /* ignore */
    }
  }, [router]);

  const setReceivingOffers = useCallback(
    async (next: boolean) => {
      const snapshot = cleanerMeRef.current;
      setReceivingOptimistic(next);
      if (snapshot) {
        setCleanerMe({
          ...snapshot,
          is_available: next,
          status: next ? "available" : "offline",
        });
      }
      setAvailabilityBusy(true);
      try {
        const r = await setCleanerAvailability(next);
        if (!r.ok) {
          if (snapshot) setCleanerMe(snapshot);
          setActionBanner(r.error);
          return;
        }
        setCleanerMe(r.cleaner);
        const headers = await getCleanerAuthHeaders();
        if (headers) await Promise.all([loadOffers(headers), loadDashboard(headers)]);
      } catch {
        if (snapshot) setCleanerMe(snapshot);
        setActionBanner("Could not update availability.");
      } finally {
        setReceivingOptimistic(null);
        setAvailabilityBusy(false);
      }
    },
    [loadDashboard, loadOffers],
  );

  const goAvailable = useCallback(() => void setReceivingOffers(true), [setReceivingOffers]);
  const goOffline = useCallback(() => void setReceivingOffers(false), [setReceivingOffers]);

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
        const bookingIdAfterAccept = snapshot?.booking_id?.trim() || undefined;
        addNotification({
          title: "Job assigned",
          body: "You accepted an offer — it appears in your upcoming jobs.",
          kind: "job_assigned",
          booking_id: bookingIdAfterAccept,
        });
        if (notificationPermission === "granted" && typeof Notification !== "undefined") {
          try {
            const bn = new Notification("Job assigned", {
              body: "View your upcoming job on Shalean.",
              tag: bookingIdAfterAccept ? `shalean-job-${bookingIdAfterAccept}` : "shalean-job-assigned",
            });
            wireBrowserNotificationClick(bn, hrefForNotificationKind("job_assigned", bookingIdAfterAccept), (h) =>
              router.push(h),
            );
          } catch {
            /* ignore */
          }
        }
        await Promise.all([loadOffers(headers), loadDashboard(headers)]);
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
    [loadDashboard, loadOffers, addNotification, notificationPermission, router],
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
        await Promise.all([loadOffers(headers), loadDashboard(headers)]);
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
    [loadDashboard, loadOffers],
  );

  const openJobCount = useMemo(() => {
    return jobRows.filter((r) => {
      const s = String(r.status ?? "").toLowerCase();
      return s !== "completed" && s !== "cancelled";
    }).length;
  }, [jobRows]);

  /** Soonest open booking by schedule (JHB), not “first section” in the grouped list — matches cleaner expectation of “next”. */
  const nextHighlightedJob = useMemo(() => {
    const open = jobRows.filter((r) => {
      const s = String(r.status ?? "").toLowerCase();
      return s !== "completed" && s !== "cancelled";
    });
    if (open.length === 0) return null;
    const sorted = [...open].sort(compareCleanerBookingStartJohannesburg);
    for (const r of sorted) {
      const pd = mobilePhaseDisplayForDashboard(r);
      if (pd === "Completed" || pd === "Cancelled") continue;
      return cleanerBookingRowToUpcomingJob(r, jhbClock.now);
    }
    return null;
  }, [jobRows, jhbClock.now]);

  const nextJobPinExtras = useMemo(() => {
    if (!nextHighlightedJob) {
      return {
        startsAtMs: null as number | null,
        mapsQuery: null as string | null,
        clockOffsetMs: serverClockOffsetMs,
        showMapsNavigation: false,
      };
    }
    const row = jobRows.find((r) => r.id === nextHighlightedJob.id);
    if (!row) {
      return {
        startsAtMs: null,
        mapsQuery: null,
        clockOffsetMs: serverClockOffsetMs,
        showMapsNavigation: false,
      };
    }
    const startsAtMs = jobStartMsJohannesburg(row.date, row.time);
    const loc = String(row.location ?? "").trim();
    const mapsQuery = loc ? (loc.split(/\r?\n/)[0]?.trim() ?? loc) : null;
    const ui = deriveCleanerJobUiState(row, { nowMs: Date.now() + serverClockOffsetMs });
    const showMapsNavigation =
      Boolean(mapsQuery) && ui.phase !== "accept" && ui.phase !== "expired" && ui.phase !== "none";
    return { startsAtMs, mapsQuery, clockOffsetMs: serverClockOffsetMs, showMapsNavigation };
  }, [nextHighlightedJob, jobRows, serverClockOffsetMs]);

  return {
    loading,
    error,
    actionBanner,
    dismissActionBanner: () => setActionBanner(null),
    notificationToast,
    dismissNotificationToast: () => setNotificationToast(null),
    notificationPermission,
    onNotificationsGranted,
    firstName,
    browserOnline,
    receivingOffers,
    rosterIncludesToday,
    goAvailable,
    goOffline,
    availabilityBusy,
    activityFeedDisplay,
    offerCards,
    upcomingJobs,
    nextHighlightedJob,
    nextJobPinExtras,
    openJobCount,
    trackedJobCount: jobRows.length,
    earningsSnapshot,
    performanceMetrics,
    acceptOffer,
    declineOffer,
    actingOfferId,
    removeOfferLocal,
    reload: loadAll,
    workSettingsRealtimeTick,
  };
}
