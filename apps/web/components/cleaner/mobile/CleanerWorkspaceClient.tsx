"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CLEANER_RESPONSE } from "@/lib/dispatch/cleanerResponseStatus";
import { useCleanerLiveLocationSender } from "@/hooks/useCleanerLiveLocationSender";
import { CleanerMobileShell } from "@/components/cleaner/mobile/CleanerMobileShell";
import type { CleanerMobileTab } from "@/components/cleaner/mobile/CleanerBottomNav";
import { CleanerHomeEarningsStrip } from "@/components/cleaner/mobile/dashboard/CleanerHomeEarningsStrip";
import {
  CleanerHomeStatusStrip,
  type CleanerHomeJobFilter,
} from "@/components/cleaner/mobile/dashboard/CleanerHomeStatusStrip";
import { CleanerWorkStatusCard } from "@/components/cleaner/mobile/dashboard/CleanerWorkStatusCard";
import { CleanerEarningsTab } from "@/components/cleaner/mobile/tabs/CleanerEarningsTab";
import type { CleanerRosterSnapshot } from "@/lib/cleaner/cleanerProfileTypes";
import { CleanerProfileTab } from "@/components/cleaner/mobile/tabs/CleanerProfileTab";
import { cleanerAuthenticatedFetch } from "@/lib/cleaner/cleanerAuthenticatedFetch";
import { addTeamAvailabilityAck, readTeamAvailabilityAckSet } from "@/lib/cleaner/teamAvailabilitySession";
import type { CleanerJobAction, PostJobActionResult } from "@/hooks/useCleanerMobileWorkspace";
import { useCleanerMobileWorkspace } from "@/hooks/useCleanerMobileWorkspace";
import { useTrustCompletionBanner } from "@/hooks/useTrustCompletionBanner";
import { useCleanerPayoutSummary } from "@/hooks/useCleanerPayoutSummary";
import { CleanerJobCompletionTrustBanner } from "@/components/cleaner/CleanerJobCompletionTrustBanner";
import { CleanerHomePerformanceStrip } from "@/components/cleaner/mobile/CleanerHomePerformanceStrip";
import { completedJobCountTodayJohannesburg } from "@/lib/cleaner/cleanerPerformanceFromJobRows";

const titles: Record<CleanerMobileTab, string> = {
  home: "Home",
  earnings: "Earnings",
  profile: "Profile",
};

export function CleanerWorkspaceClient() {
  const [tab, setTab] = useState<CleanerMobileTab>("home");
  const [actionBanner, setActionBanner] = useState<string | null>(null);
  const [availabilityBanner, setAvailabilityBanner] = useState<string | null>(null);
  const [offerBanner, setOfferBanner] = useState<string | null>(null);
  const { trustCompletion, showTrustCompletionBanner } = useTrustCompletionBanner();
  const [teamAvailabilityAckIds, setTeamAvailabilityAckIds] = useState<Set<string>>(() => new Set());
  const [now, setNow] = useState(() => new Date());
  const [homeJobFilter, setHomeJobFilter] = useState<CleanerHomeJobFilter>("today");
  const [roster, setRoster] = useState<CleanerRosterSnapshot | null>(null);

  useEffect(() => {
    const tick = () => setNow(new Date());
    const id = window.setInterval(tick, 60_000);
    const onVis = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  const { refresh: refreshPayoutSummary, ...payout } = useCleanerPayoutSummary();

  const {
    rows,
    activeJob,
    nextJob,
    topOffer,
    rankedSoloOffers,
    extraSoloOffersTodayCount,
    loading,
    error,
    actingId,
    offerActingId,
    postJobAction,
    respondToOffer,
    setAvailability,
    profile,
    online,
    reload,
  } = useCleanerMobileWorkspace();

  const earningsHighlightJob = useMemo(() => activeJob ?? nextJob, [activeJob, nextJob]);
  const openJobsCount = useMemo(
    () =>
      rows.filter((r) => {
        const st = String(r.status ?? "").toLowerCase();
        return st !== "completed" && st !== "cancelled";
      }).length,
    [rows],
  );

  const trackingBookingId = useMemo(() => {
    for (const r of rows) {
      const st = String(r.status ?? "").toLowerCase();
      if (st === "completed" || st === "cancelled") continue;
      const crs = String(r.cleaner_response_status ?? "")
        .trim()
        .toLowerCase();
      if (crs === CLEANER_RESPONSE.ON_MY_WAY) return r.id;
    }
    return null;
  }, [rows]);

  useCleanerLiveLocationSender({
    bookingId: trackingBookingId,
    enabled: Boolean(trackingBookingId),
    online,
  });

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
    if ("Notification" in window && Notification.permission === "default") {
      void Notification.requestPermission().catch(() => {});
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      setTeamAvailabilityAckIds(readTeamAvailabilityAckSet());
    });
  }, [rows]);

  useEffect(() => {
    if (tab !== "profile") return;
    void (async () => {
      try {
        const res = await cleanerAuthenticatedFetch("/api/cleaner/roster");
        if (!res.ok) {
          setRoster(null);
          return;
        }
        const j = (await res.json()) as CleanerRosterSnapshot;
        setRoster(j);
      } catch {
        setRoster(null);
      }
    })();
  }, [tab]);

  useEffect(() => {
    if (!availabilityBanner) return;
    const t = window.setTimeout(() => setAvailabilityBanner(null), 5200);
    return () => window.clearTimeout(t);
  }, [availabilityBanner]);

  const onJobAction = useCallback(
    async (
      bookingId: string,
      action: CleanerJobAction,
      opts?: { teamAvailabilityConfirm?: boolean; scheduleSummary?: string },
    ): Promise<PostJobActionResult> => {
      setActionBanner(null);
      setAvailabilityBanner(null);
      const r = await postJobAction(bookingId, action);
      if (!r.ok) {
        setActionBanner(r.error ?? "Something went wrong.");
        return r;
      }
      if (r.trustCompletion) {
        let fb = r.trustCompletion;
        if (action === "complete") {
          const sum = await refreshPayoutSummary();
          fb = { ...r.trustCompletion, todayTotalCents: sum?.today_cents ?? null };
        }
        showTrustCompletionBanner(fb);
      }
      if (action === "accept") {
        addTeamAvailabilityAck(bookingId);
        setTeamAvailabilityAckIds(readTeamAvailabilityAckSet());
        if (opts?.teamAvailabilityConfirm === true) {
          setAvailabilityBanner(opts.scheduleSummary ?? "✅ You're scheduled for this job.");
        }
      }
      return r;
    },
    [postJobAction, refreshPayoutSummary, showTrustCompletionBanner],
  );

  const onOfferAcceptedUi = useCallback((_bookingId: string) => {
    void _bookingId;
    window.setTimeout(() => {
      document.getElementById("cleaner-work-status")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, 380);
  }, []);

  const onAcceptOffer = useCallback(
    async (offerId: string, uxVariant?: string | null) => {
      setOfferBanner(null);
      const r = await respondToOffer(offerId, "accept", uxVariant);
      if (!r.ok) {
        setOfferBanner(r.error ?? "Could not accept offer.");
        return false;
      }
      return true;
    },
    [respondToOffer],
  );

  const onDeclineOffer = useCallback(
    async (offerId: string) => {
      setOfferBanner(null);
      const r = await respondToOffer(offerId, "decline");
      if (!r.ok) setOfferBanner(r.error ?? "Could not decline offer.");
    },
    [respondToOffer],
  );

  const alertStrip =
    !online && !loading ? (
      <p className="px-4 py-2.5 text-center text-sm font-medium text-amber-950 dark:bg-amber-950/40 dark:text-amber-100">
        You are offline. Reconnect to respond to job offers or save job updates.
      </p>
    ) : null;

  const nowMs = now.getTime();

  const cleanerRating = profile?.rating ?? 5;

  const completedTodayCount = useMemo(
    () => completedJobCountTodayJohannesburg(rows, new Date(nowMs)),
    [rows, nowMs],
  );

  return (
    <CleanerMobileShell
      title={titles[tab]}
      activeTab={tab}
      onTabChange={setTab}
      alert={alertStrip}
      headerProfile={
        tab === "profile"
          ? null
          : profile
            ? {
                displayName: profile.name,
                isAvailable: profile.isAvailable,
                showNotificationDot: Boolean(topOffer),
                availabilityMicrocopy: profile.isAvailable
                  ? "You're visible to customers."
                  : "You won't receive new jobs.",
                homeStrip:
                  tab === "home" ? (
                    <CleanerHomeStatusStrip
                      isAvailable={profile.isAvailable}
                      activeFilter={homeJobFilter}
                      onFilterChange={setHomeJobFilter}
                      layout="grid"
                    />
                  ) : undefined,
              }
            : null
      }
      simpleHeaderBell={
        tab === "profile" ? { showDot: Boolean(topOffer), onClick: () => setTab("home") } : undefined
      }
      onBellClick={() => setTab("home")}
      contentClassName="px-4 pb-8 pt-3"
    >
      {tab === "home" ? (
        <div className="mx-auto max-w-md space-y-6">
          {trustCompletion ? <CleanerJobCompletionTrustBanner feedback={trustCompletion} /> : null}
          {availabilityBanner ? (
            <p
              className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-950 dark:border-emerald-900/50 dark:bg-emerald-950/35 dark:text-emerald-100"
              role="status"
            >
              {availabilityBanner}
            </p>
          ) : null}
          {actionBanner ? (
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/35 dark:text-amber-100">
              {actionBanner}
            </p>
          ) : null}
          {offerBanner ? (
            <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900 dark:border-rose-900/50 dark:bg-rose-950/35 dark:text-rose-100">
              {offerBanner}
            </p>
          ) : null}

          {error ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-200">
              {error}
            </div>
          ) : null}

          {!error ? (
            <CleanerHomePerformanceStrip
              todayCents={payout.summary?.today_cents ?? 0}
              weekCents={payout.summary?.week_cents ?? 0}
              loading={loading || payout.loading}
              jobsCompleted={profile?.jobsCompleted}
              completedTodayCount={completedTodayCount}
            />
          ) : null}

          {!error ? (
            <CleanerWorkStatusCard
              loading={loading}
              rows={rows}
              nowMs={nowMs}
              jobsCompleted={profile?.jobsCompleted}
              cleanerCreatedAtIso={profile?.createdAt ?? null}
              rankedSoloOffers={rankedSoloOffers}
              extraSoloOffersTodayCount={extraSoloOffersTodayCount}
              offerActingId={offerActingId}
              onAcceptOffer={onAcceptOffer}
              onDeclineOffer={onDeclineOffer}
              onOfferAcceptedUi={onOfferAcceptedUi}
              teamAvailabilityAckIds={teamAvailabilityAckIds}
              actingId={actingId}
              onJobAction={onJobAction}
              cleanerRating={cleanerRating}
              isAvailable={profile?.isAvailable ?? true}
              onIssueReportSuccess={() => {
                void reload();
                void refreshPayoutSummary();
              }}
              jobFilter={homeJobFilter}
            />
          ) : null}

          {!error ? (
            <CleanerHomeEarningsStrip
              eligibleCents={payout.summary?.eligible_cents ?? 0}
              pendingCents={payout.summary?.pending_cents ?? 0}
              paidCents={payout.summary?.paid_cents ?? 0}
              invalidCents={payout.summary?.invalid_cents ?? 0}
              completedEarningsRowCount={payout.rows?.length ?? 0}
              loading={loading || payout.loading}
              missingBankDetails={payout.missingBankDetails}
              onViewEarnings={() => setTab("earnings")}
            />
          ) : null}
        </div>
      ) : null}
      {tab === "earnings" ? (
        <div className="mx-auto max-w-md">
          <CleanerEarningsTab
            loading={loading}
            error={error}
            payoutSummary={payout.summary}
            payoutLoading={payout.loading}
            payoutError={payout.error}
            payoutRows={payout.rows}
            missingBankDetails={payout.missingBankDetails}
            hasFailedTransfer={payout.hasFailedTransfer}
            highlightJob={earningsHighlightJob}
            openJobsCount={openJobsCount}
            onRefreshPayout={() => void refreshPayoutSummary()}
          />
        </div>
      ) : null}
      {tab === "profile" ? (
        <div className="mx-auto max-w-md">
          <CleanerProfileTab profile={profile} roster={roster} onSetAvailability={setAvailability} />
        </div>
      ) : null}
    </CleanerMobileShell>
  );
}
