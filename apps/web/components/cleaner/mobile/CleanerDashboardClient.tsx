"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CleanerMobileShell } from "@/components/cleaner/mobile/CleanerMobileShell";
import type { CleanerMobileTab } from "@/components/cleaner/mobile/CleanerBottomNav";
import { CleanerOffersPanel } from "@/components/cleaner/mobile/CleanerOffersPanel";
import { AvailableJobsCard, MyJobsSectionLabel } from "@/components/cleaner/mobile/dashboard/AvailableJobsCard";
import { CleanerDashboardHome } from "@/components/cleaner/mobile/dashboard/CleanerDashboardHome";
import { CleanerEarningsTab } from "@/components/cleaner/mobile/tabs/CleanerEarningsTab";
import { CleanerProfileTab } from "@/components/cleaner/mobile/tabs/CleanerProfileTab";
import { CleanerScheduleTab } from "@/components/cleaner/mobile/tabs/CleanerScheduleTab";
import { addTeamAvailabilityAck, readTeamAvailabilityAckSet } from "@/lib/cleaner/teamAvailabilitySession";
import type { CleanerJobAction } from "@/hooks/useCleanerMobileWorkspace";
import { useCleanerMobileWorkspace } from "@/hooks/useCleanerMobileWorkspace";
import { todayPotentialEarningsZar } from "@/lib/cleaner/cleanerMobileBookingMap";

const titles: Record<CleanerMobileTab, string> = {
  home: "Home",
  schedule: "Schedule",
  earnings: "Earnings",
  profile: "Profile",
};

export function CleanerDashboardClient() {
  const [tab, setTab] = useState<CleanerMobileTab>("home");
  const [actionBanner, setActionBanner] = useState<string | null>(null);
  const [availabilityBanner, setAvailabilityBanner] = useState<string | null>(null);
  const [offerBanner, setOfferBanner] = useState<string | null>(null);
  const [teamAvailabilityAckIds, setTeamAvailabilityAckIds] = useState<Set<string>>(() => new Set());
  const now = useMemo(() => new Date(), []);

  const [pulseJobId, setPulseJobId] = useState<string | null>(null);

  const {
    rows,
    topOffer,
    topOfferPrimaryBadge,
    weeklyEarningsGoalZar,
    extraSoloOffersTodayCount,
    loading,
    error,
    actingId,
    offerActingId,
    postJobAction,
    respondToOffer,
    setAvailability,
    activeJob,
    nextJob,
    earnings,
    earningsRows,
    profile,
    online,
  } = useCleanerMobileWorkspace();

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
    if ("Notification" in window && Notification.permission === "default") {
      void Notification.requestPermission().catch(() => {});
    }
  }, []);

  useEffect(() => {
    setTeamAvailabilityAckIds(readTeamAvailabilityAckSet());
  }, [rows]);

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
    ) => {
      setActionBanner(null);
      setAvailabilityBanner(null);
      const r = await postJobAction(bookingId, action);
      if (!r.ok) {
        setActionBanner(r.error ?? "Something went wrong.");
        return;
      }
      if (opts?.teamAvailabilityConfirm === true && action === "accept") {
        addTeamAvailabilityAck(bookingId);
        setTeamAvailabilityAckIds(readTeamAvailabilityAckSet());
        setAvailabilityBanner(opts.scheduleSummary ?? "✅ You're scheduled for this job.");
      }
    },
    [postJobAction],
  );

  const onOfferAcceptedUi = useCallback((bookingId: string) => {
    window.setTimeout(() => {
      document.getElementById("cleaner-my-jobs")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, 380);
    setPulseJobId(bookingId);
    window.setTimeout(() => setPulseJobId((id) => (id === bookingId ? null : id)), 4500);
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

  const todayPotential = useMemo(
    () => todayPotentialEarningsZar({ rows, topOffer, now: new Date() }),
    [rows, topOffer],
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

  const offersSlot =
    loading ? (
      <div className="h-40 animate-pulse rounded-2xl bg-zinc-100 dark:bg-zinc-800/80" aria-hidden />
    ) : topOffer ? (
      <CleanerOffersPanel
        offer={topOffer}
        busy={Boolean(offerActingId)}
        busyOfferId={offerActingId}
        primaryOfferBadge={topOfferPrimaryBadge}
        moreJobsTodayCount={extraSoloOffersTodayCount}
        hideSectionHeading
        onAccept={onAcceptOffer}
        onDecline={onDeclineOffer}
        onAcceptSuccess={onOfferAcceptedUi}
      />
    ) : null;

  return (
    <CleanerMobileShell
      title={titles[tab]}
      activeTab={tab}
      onTabChange={setTab}
      alert={alertStrip}
      headerProfile={
        profile
          ? {
              displayName: profile.name,
              isAvailable: profile.isAvailable,
              showNotificationDot: Boolean(topOffer),
            }
          : null
      }
      onBellClick={() => setTab("home")}
      contentClassName="px-4 pb-8 pt-3"
    >
      {tab === "home" ? (
        <div className="mx-auto max-w-md space-y-4">
          {availabilityBanner ? (
            <p
              className="mb-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-950 dark:border-emerald-900/50 dark:bg-emerald-950/35 dark:text-emerald-100"
              role="status"
            >
              {availabilityBanner}
            </p>
          ) : null}
          {actionBanner ? (
            <p className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/35 dark:text-amber-100">
              {actionBanner}
            </p>
          ) : null}
          {offerBanner ? (
            <p className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900 dark:border-rose-900/50 dark:bg-rose-950/35 dark:text-rose-100">
              {offerBanner}
            </p>
          ) : null}

          <AvailableJobsCard>{offersSlot}</AvailableJobsCard>

          <section id="cleaner-my-jobs" className="scroll-mt-4 space-y-4">
            <MyJobsSectionLabel />

            <CleanerDashboardHome
              loading={loading}
              error={error}
              activeJob={activeJob}
              nextJob={nextJob}
              hasAnyJob={rows.length > 0}
              actingId={actingId}
              teamAvailabilityAckIds={teamAvailabilityAckIds}
              onJobAction={onJobAction}
              todayPotentialZar={todayPotential.zar}
              todayPotentialHasGap={todayPotential.hasGap}
              weekEarnedZar={earnings.week}
              weeklyGoalZar={weeklyEarningsGoalZar}
              highlightJobId={pulseJobId}
              cleanerRating={profile?.rating ?? null}
            />
          </section>
        </div>
      ) : null}
      {tab === "schedule" ? (
        <div className="mx-auto max-w-md">
          <CleanerScheduleTab rows={rows} now={now} loading={loading} />
        </div>
      ) : null}
      {tab === "earnings" ? (
        <div className="mx-auto max-w-md">
          <CleanerEarningsTab
            loading={loading}
            error={error}
            today={earnings.today}
            week={earnings.week}
            month={earnings.month}
            rows={earningsRows}
          />
        </div>
      ) : null}
      {tab === "profile" ? (
        <div className="mx-auto max-w-md">
          <CleanerProfileTab profile={profile} onSetAvailability={setAvailability} />
        </div>
      ) : null}
    </CleanerMobileShell>
  );
}
