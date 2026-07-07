"use client";

import { useEffect } from "react";
import { useCleanerDashboardData } from "@/hooks/useCleanerDashboardData";
import { Button } from "@/components/ui/button";
import { ActiveJobHero } from "./ActiveJobHero";
import { CleanerActivityStrip } from "./CleanerActivityStrip";
import { useCleanerNavBadges } from "./CleanerNavBadgesContext";
import { CleanerStateBanner } from "./CleanerStateBanner";
import { EarningsCard } from "./EarningsCard";
import { Header } from "./Header";
import { JobOffersSection } from "./JobOffersSection";
import { NextJobPin } from "./NextJobPin";
import { PendingOffersDashboardHero } from "./PendingOffersDashboardHero";
import { PendingOffersFloatingCta } from "./PendingOffersFloatingCta";
import { UpcomingJobsSection } from "./UpcomingJobsSection";

/**
 * Cleaner Home — operational cockpit.
 *
 * One screen, one mental model. The dashboard prioritises information
 * density and operational clarity over explanatory chrome. Render order:
 *
 *   1. Header (Hi, [Name]) — small.
 *   2. STATUS surface — single soft-tinted card combining online state,
 *      "Looking for nearby jobs" ticker (when idle), Jobs / ★ / Today
 *      earnings, and the Go online / Go offline toggle. The previous
 *      stand-alone "searching" card has been folded in here so idle state
 *      stops fragmenting the surface.
 *   3. Sticky pending-offers hero (when offers exist) — impossible to
 *      scroll past, anchored to the offer cards immediately below.
 *   4. Per-surface error strips (non-blocking; never hide a loaded offer).
 *   5. Primary action hero — Active job ⟶ Next job pin. When neither
 *      exists this is null because the searching ticker in (2) already
 *      tells the cleaner what's happening.
 *   6. Today earnings card (compact dark progress strip).
 *   7. Upcoming jobs list (rendered ONLY when jobs exist).
 *   8. Recent activity ticker (rendered ONLY when entries exist).
 *   9. Floating offers CTA — fixed above the bottom nav, persists on scroll.
 *
 * Empty sections (no offers, no upcoming, no activity) intentionally render
 * nothing — workforce dashboards should reward scrolling with information,
 * not with empty-state hand-holding.
 *
 * Settings (Work preferences / weekly schedule / preferred areas) live on
 * the Profile page — they are not part of the live operational console.
 */
export function CleanerDashboard() {
  const { setOpenJobsCount, setPendingOffersCount } = useCleanerNavBadges();
  const {
    loading,
    error,
    dashboardError,
    offersError,
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
    activeJob,
    activeJobRow,
    patchJobRow,
    refreshDashboard,
    confirmedIdle,
    availabilityState,
    openJobCount,
    trackedJobCount,
    earningsSnapshot,
    performanceMetrics,
    acceptOffer,
    declineOffer,
    actingOfferId,
    removeOfferLocal,
  } = useCleanerDashboardData();

  useEffect(() => {
    setOpenJobsCount(openJobCount);
  }, [openJobCount, setOpenJobsCount]);

  // Pending offers belong to the Home tab badge — keep it in sync regardless
  // of whether SMS notification succeeded for this offer. Once written, the
  // value persists in the layout-level provider so the badge survives
  // navigation to Earnings/Profile and only changes again when a producing
  // page re-fetches.
  useEffect(() => {
    setPendingOffersCount(offerCards.length);
  }, [offerCards.length, setPendingOffersCount]);

  const hasPendingOffers = offerCards.length > 0;
  // Idle = no live work to do. The status strip uses this to surface its
  // inline "Looking for nearby jobs" ticker so the searching state stops
  // needing a stand-alone card below the strip.
  const isIdle = !activeJob && !nextHighlightedJob && !hasPendingOffers;

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-lg space-y-3 bg-background p-3">
        <div className="h-7 w-40 animate-pulse rounded-md bg-muted" />
        <div className="h-16 animate-pulse rounded-xl bg-muted" />
        <div className="h-20 animate-pulse rounded-xl bg-muted" />
        <div className="h-24 animate-pulse rounded-xl bg-muted" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto w-full max-w-lg space-y-4 bg-background p-4">
        <Header firstName={firstName} notificationPermission={notificationPermission} />
        <p className="text-sm text-destructive">{error}</p>
      </div>
    );
  }

  // Active > next > nothing. Active job hero only fires when the cleaner is
  // actually mid-flight (`en_route` / `in_progress`); otherwise the next-job
  // pin handles "do this next". When neither is set we render NOTHING here
  // — the status strip already shows "Looking for nearby jobs" inline.
  let primaryHero: React.ReactNode = null;
  if (activeJob && activeJobRow) {
    const mapsQuery = String(activeJobRow.location ?? "").trim()
      ? (String(activeJobRow.location).split(/\r?\n/)[0]?.trim() ?? String(activeJobRow.location))
      : null;
    primaryHero = (
      <ActiveJobHero
        job={activeJob}
        bookingRow={activeJobRow}
        mapsQuery={mapsQuery}
        clockOffsetMs={nextJobPinExtras.clockOffsetMs}
        onRowPatched={patchJobRow}
        onRefresh={() => void refreshDashboard()}
      />
    );
  } else if (nextHighlightedJob) {
    primaryHero = (
      <NextJobPin
        job={nextHighlightedJob}
        startsAtMs={nextJobPinExtras.startsAtMs}
        mapsQuery={nextJobPinExtras.mapsQuery}
        clockOffsetMs={nextJobPinExtras.clockOffsetMs}
        showMapsNavigation={nextJobPinExtras.showMapsNavigation}
      />
    );
  }

  return (
    <>
      <div className="mx-auto w-full max-w-lg space-y-3 bg-background px-4 pb-24 pt-2">
        <Header firstName={firstName} notificationPermission={notificationPermission} />

        {/*
          STATUS + METRICS — single dense strip with online state, jobs,
          rating, today earnings, and the Go online / Go offline toggle.
          Renders BEFORE the offer hero so the cleaner sees their cockpit
          numbers first; the sticky offer hero below still pins to top of
          viewport when offers exist.
        */}
        <CleanerStateBanner
          compact
          browserOnline={browserOnline}
          receivingOffers={receivingOffers}
          rosterIncludesToday={rosterIncludesToday}
          onGoAvailable={() => void goAvailable()}
          onGoOffline={() => void goOffline()}
          availabilityBusy={availabilityBusy}
          performanceMetrics={performanceMetrics}
          openJobsCount={openJobCount}
          todayEarningsLabel={earningsSnapshot.todayZarLabel}
          idle={isIdle}
          searchingConfirmed={confirmedIdle}
          notificationPermission={notificationPermission}
          onNotificationsGranted={onNotificationsGranted}
          workloadHint={
            availabilityState.stateKey === "in-job"
              ? "active"
              : availabilityState.stateKey === "booked"
                ? "booked"
                : availabilityState.stateKey === "off-today"
                  ? "off-today"
                  : null
          }
        />

        {/*
          STICKY OFFER HERO + OFFER CARDS — operational priority #1.
          Sticky so the cleaner cannot scroll past a pending offer; the
          offer cards render immediately below for a single-tap accept.
        */}
        {hasPendingOffers ? (
          <>
            <PendingOffersDashboardHero pendingOffersCount={offerCards.length} sticky />
            <JobOffersSection
              offers={offerCards}
              actingOfferId={actingOfferId}
              onAccept={(id, ux) => void acceptOffer(id, ux ?? null)}
              onDecline={(id) => void declineOffer(id)}
              onOfferExpired={removeOfferLocal}
            />
          </>
        ) : null}

        {/*
          Per-surface errors render as non-blocking strips so a transient
          /api/cleaner/dashboard or /api/cleaner/offers blip CANNOT hide a
          successfully-loaded offer card above. The previous single-`error`
          early-return UI was the root cause of "inconsistently failing to
          show pending offers" — see hook comment for repro.
        */}
        {offersError ? (
          <div
            role="status"
            className="rounded-lg bg-amber-500/10 px-3 py-1.5 text-[11px] text-amber-950 dark:text-amber-50"
          >
            Couldn&apos;t refresh offers — showing last loaded.
          </div>
        ) : null}
        {dashboardError ? (
          <div
            role="status"
            className="rounded-lg bg-amber-500/10 px-3 py-1.5 text-[11px] text-amber-950 dark:text-amber-50"
          >
            Couldn&apos;t refresh dashboard data — offers above are still live.
          </div>
        ) : null}

        {/* PRIMARY ACTION — active job > next job > "looking for jobs". */}
        {primaryHero}

        {/* TODAY EARNINGS — compact progress card. */}
        <EarningsCard earnings={earningsSnapshot} />

        {notificationToast ? (
          <div className="flex items-start justify-between gap-3 rounded-xl border border-emerald-500/35 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-950 dark:text-emerald-50">
            <p className="min-w-0 flex-1">{notificationToast}</p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="shrink-0 text-emerald-900 dark:text-emerald-100"
              onClick={dismissNotificationToast}
            >
              OK
            </Button>
          </div>
        ) : null}

        {actionBanner ? (
          <div className="flex items-start justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            <p className="min-w-0 flex-1">{actionBanner}</p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="shrink-0 active:scale-95"
              onClick={dismissActionBanner}
            >
              Dismiss
            </Button>
          </div>
        ) : null}

        {/* UPCOMING JOBS — only renders when jobs exist (else returns null). */}
        <UpcomingJobsSection
          jobs={upcomingJobs}
          openJobCount={openJobCount}
          trackedJobCount={trackedJobCount}
          browserOnline={browserOnline}
          receivingOffers={receivingOffers}
        />

        {/* RECENT ACTIVITY — only renders when entries exist (else null). */}
        <CleanerActivityStrip entries={activityFeedDisplay} />

        {/*
          Empty-state offers anchor — when no pending offers exist, the
          JobOffersSection still renders here as an `sr-only` heading anchor
          for the floating CTA / sticky hero (both link to
          #cleaner-offers-heading).
        */}
        {hasPendingOffers ? null : (
          <JobOffersSection
            offers={offerCards}
            actingOfferId={actingOfferId}
            onAccept={(id, ux) => void acceptOffer(id, ux ?? null)}
            onDecline={(id) => void declineOffer(id)}
            onOfferExpired={removeOfferLocal}
          />
        )}
      </div>

      {/*
        FLOATING OFFERS CTA — portaled out of the column container so it
        anchors to the viewport edges (clears the bottom nav via safe-area).
        Hidden when no pending offers exist.
      */}
      <PendingOffersFloatingCta pendingOffersCount={offerCards.length} />
    </>
  );
}
