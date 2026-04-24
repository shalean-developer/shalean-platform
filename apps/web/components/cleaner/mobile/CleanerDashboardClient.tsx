"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CleanerMobileShell } from "@/components/cleaner/mobile/CleanerMobileShell";
import type { CleanerMobileTab } from "@/components/cleaner/mobile/CleanerBottomNav";
import { CleanerOffersPanel } from "@/components/cleaner/mobile/CleanerOffersPanel";
import { CleanerEarningsTab } from "@/components/cleaner/mobile/tabs/CleanerEarningsTab";
import { CleanerHomeTab } from "@/components/cleaner/mobile/tabs/CleanerHomeTab";
import { CleanerProfileTab } from "@/components/cleaner/mobile/tabs/CleanerProfileTab";
import { CleanerScheduleTab } from "@/components/cleaner/mobile/tabs/CleanerScheduleTab";
import type { CleanerJobAction } from "@/hooks/useCleanerMobileWorkspace";
import { useCleanerMobileWorkspace } from "@/hooks/useCleanerMobileWorkspace";

const titles: Record<CleanerMobileTab, string> = {
  home: "Home",
  schedule: "Schedule",
  earnings: "Earnings",
  profile: "Profile",
};

export function CleanerDashboardClient() {
  const [tab, setTab] = useState<CleanerMobileTab>("home");
  const [actionBanner, setActionBanner] = useState<string | null>(null);
  const [offerBanner, setOfferBanner] = useState<string | null>(null);
  const now = useMemo(() => new Date(), []);

  const {
    rows,
    topOffer,
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

  const onJobAction = useCallback(
    async (bookingId: string, action: CleanerJobAction) => {
      setActionBanner(null);
      const r = await postJobAction(bookingId, action);
      if (!r.ok) setActionBanner(r.error ?? "Something went wrong.");
    },
    [postJobAction],
  );

  const onAcceptOffer = useCallback(
    async (offerId: string) => {
      setOfferBanner(null);
      const r = await respondToOffer(offerId, "accept");
      if (!r.ok) setOfferBanner(r.error ?? "Could not accept offer.");
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
        You are offline. Reconnect to accept offers or save job updates.
      </p>
    ) : null;

  return (
    <CleanerMobileShell title={titles[tab]} activeTab={tab} onTabChange={setTab} alert={alertStrip}>
      {actionBanner && tab === "home" ? (
        <p className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/35 dark:text-amber-100">
          {actionBanner}
        </p>
      ) : null}
      {offerBanner && tab === "home" ? (
        <p className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900 dark:border-rose-900/50 dark:bg-rose-950/35 dark:text-rose-100">
          {offerBanner}
        </p>
      ) : null}
      {tab === "home" ? (
        <>
          <CleanerOffersPanel
            offer={topOffer}
            busy={Boolean(offerActingId)}
            onAccept={onAcceptOffer}
            onDecline={onDeclineOffer}
          />
          <CleanerHomeTab
            loading={loading}
            error={error}
            activeJob={activeJob}
            nextJob={nextJob}
            hasAnyJob={rows.length > 0}
            actingId={actingId}
            onJobAction={onJobAction}
          />
        </>
      ) : null}
      {tab === "schedule" ? <CleanerScheduleTab rows={rows} now={now} loading={loading} /> : null}
      {tab === "earnings" ? (
        <CleanerEarningsTab
          loading={loading}
          error={error}
          today={earnings.today}
          week={earnings.week}
          month={earnings.month}
          rows={earningsRows}
        />
      ) : null}
      {tab === "profile" ? <CleanerProfileTab profile={profile} onSetAvailability={setAvailability} /> : null}
    </CleanerMobileShell>
  );
}
