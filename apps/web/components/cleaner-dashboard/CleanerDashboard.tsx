"use client";

import { useEffect } from "react";
import { useCleanerDashboardData } from "@/hooks/useCleanerDashboardData";
import { Button } from "@/components/ui/button";
import { CleanerActivityStrip } from "./CleanerActivityStrip";
import { CleanerHeroBlock } from "./CleanerHeroMotion";
import { CleanerHeroStack } from "./CleanerHeroStack";
import { useCleanerNavBadges } from "./CleanerNavBadgesContext";
import { CleanerStateBanner } from "./CleanerStateBanner";
import { EarningsCard } from "./EarningsCard";
import { Header } from "./Header";
import { JobOffersSection } from "./JobOffersSection";
import { NextJobEmptyHint } from "./NextJobEmptyHint";
import { NextJobPin } from "./NextJobPin";
import { UpcomingJobsSection } from "./UpcomingJobsSection";

export function CleanerDashboard() {
  const { setOpenJobsCount } = useCleanerNavBadges();
  const {
    loading,
    error,
    actionBanner,
    dismissActionBanner,
    notificationToast,
    dismissNotificationToast,
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
    trackedJobCount,
    earningsSnapshot,
    acceptOffer,
    declineOffer,
    actingOfferId,
    removeOfferLocal,
  } = useCleanerDashboardData();

  useEffect(() => {
    setOpenJobsCount(openJobCount);
  }, [openJobCount, setOpenJobsCount]);

  if (loading) {
    return (
      <div className="mx-auto min-h-[100dvh] w-full max-w-lg space-y-5 bg-background p-4 pb-28">
        <div className="h-10 w-48 animate-pulse rounded-lg bg-muted" />
        <div className="h-28 animate-pulse rounded-2xl bg-muted" />
        <div className="h-32 animate-pulse rounded-2xl bg-muted" />
        <div className="h-24 animate-pulse rounded-2xl bg-muted" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto min-h-[100dvh] w-full max-w-lg space-y-4 bg-background p-4 pb-28">
        <Header firstName={firstName} notificationPermission={notificationPermission} />
        <p className="text-sm text-destructive">{error}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto min-h-[100dvh] w-full max-w-lg space-y-5 bg-background px-4 pb-28 pt-4">
      <Header firstName={firstName} notificationPermission={notificationPermission} />

      <CleanerHeroStack>
        <CleanerHeroBlock className="p-4">
          <CleanerStateBanner
            embedded
            browserOnline={browserOnline}
            receivingOffers={receivingOffers}
            rosterIncludesToday={rosterIncludesToday}
            onGoAvailable={() => void goAvailable()}
            onGoOffline={() => void goOffline()}
            availabilityBusy={availabilityBusy}
          />
        </CleanerHeroBlock>

        <CleanerHeroBlock className="p-4">
          {nextHighlightedJob ? (
            <NextJobPin
              embedded
              job={nextHighlightedJob}
              startsAtMs={nextJobPinExtras.startsAtMs}
              mapsQuery={nextJobPinExtras.mapsQuery}
              clockOffsetMs={nextJobPinExtras.clockOffsetMs}
            />
          ) : (
            <NextJobEmptyHint
              embedded
              receivingOffers={receivingOffers}
              browserOnline={browserOnline}
              onNotificationsGranted={onNotificationsGranted}
            />
          )}
        </CleanerHeroBlock>

        <CleanerHeroBlock className="p-4">
          <EarningsCard embedded earnings={earningsSnapshot} />
        </CleanerHeroBlock>
      </CleanerHeroStack>

      {notificationToast ? (
        <div className="flex items-start justify-between gap-3 rounded-xl border border-emerald-500/35 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-950 dark:text-emerald-50">
          <p className="min-w-0 flex-1">{notificationToast}</p>
          <Button type="button" variant="ghost" size="sm" className="shrink-0 text-emerald-900 dark:text-emerald-100" onClick={dismissNotificationToast}>
            OK
          </Button>
        </div>
      ) : null}

      {actionBanner ? (
        <div className="flex items-start justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          <p className="min-w-0 flex-1">{actionBanner}</p>
          <Button type="button" variant="ghost" size="sm" className="shrink-0 active:scale-95" onClick={dismissActionBanner}>
            Dismiss
          </Button>
        </div>
      ) : null}

      <CleanerActivityStrip entries={activityFeedDisplay} />

      <JobOffersSection
        offers={offerCards}
        actingOfferId={actingOfferId}
        onAccept={(id, ux) => void acceptOffer(id, ux ?? null)}
        onDecline={(id) => void declineOffer(id)}
        onOfferExpired={removeOfferLocal}
      />

      <UpcomingJobsSection
        jobs={upcomingJobs}
        openJobCount={openJobCount}
        trackedJobCount={trackedJobCount}
        browserOnline={browserOnline}
        receivingOffers={receivingOffers}
      />
    </div>
  );
}
