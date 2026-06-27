"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useCleanerDashboardData } from "@/hooks/useCleanerDashboardData";
import { useCleanerNavBadges } from "@/components/cleaner-dashboard/CleanerNavBadgesContext";
import { CleanerPageHeader } from "@/components/cleaner/CleanerPageHeader";
import { AvailabilityCard } from "@/components/cleaner/AvailabilityCard";
import { NextJobCard } from "@/components/cleaner/NextJobCard";
import { CleanerEarningsCard } from "@/components/cleaner/EarningsCard";
import { QuickActionCard } from "@/components/cleaner/QuickActionCard";
import { ActivityFeed } from "@/components/cleaner/ActivityFeed";
import { JobOffersSection } from "@/components/cleaner-dashboard/JobOffersSection";
import { PendingOffersDashboardHero } from "@/components/cleaner-dashboard/PendingOffersDashboardHero";
import { ActiveJobHero } from "@/components/cleaner-dashboard/ActiveJobHero";
import { formatCleanerJobEarningDisplay } from "@/lib/cleaner/cleanerJobEarning";
import { Button } from "@/components/ui/button";

function HomeLoadingSkeleton() {
  return (
    <div className="mx-auto w-full max-w-lg px-4 pt-4 space-y-3 animate-pulse">
      <div className="h-8 w-48 rounded-xl bg-gray-200" />
      <div className="h-4 w-36 rounded-lg bg-gray-100" />
      <div className="h-28 rounded-2xl bg-gray-200" />
      <div className="h-40 rounded-2xl bg-gray-200" />
      <div className="h-20 rounded-2xl bg-gray-200" />
      <div className="h-24 rounded-2xl bg-gray-200" />
    </div>
  );
}

export default function JobsHomePage() {
  const { setOpenJobsCount, setPendingOffersCount } = useCleanerNavBadges();

  const {
    loading,
    error,
    dashboardError,
    offersError,
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
    nextHighlightedJobRow,
    nextJobPinExtras,
    activeJob,
    activeJobRow,
    patchJobRow,
    refreshDashboard,
    confirmedIdle,
    openJobCount,
    earningsSnapshot,
    performanceMetrics,
    acceptOffer,
    declineOffer,
    actingOfferId,
    removeOfferLocal,
    actionBanner,
    dismissActionBanner,
  } = useCleanerDashboardData();

  useEffect(() => { setOpenJobsCount(openJobCount); }, [openJobCount, setOpenJobsCount]);
  useEffect(() => { setPendingOffersCount(offerCards.length); }, [offerCards.length, setPendingOffersCount]);

  if (loading) return <HomeLoadingSkeleton />;

  if (error) {
    return (
      <div className="mx-auto w-full max-w-lg px-4 pt-4 space-y-4">
        <CleanerPageHeader firstName={firstName || "there"} />
        <p className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
      </div>
    );
  }

  const hasPendingOffers = offerCards.length > 0;
  const isIdle = !activeJob && !nextHighlightedJob && !hasPendingOffers;
  const ratingLabel =
    typeof performanceMetrics?.rating === "number"
      ? performanceMetrics.rating.toFixed(1)
      : null;

  const upcomingForHome = upcomingJobs
    .filter((j) => j.phaseDisplay !== "Completed" && j.phaseDisplay !== "Cancelled")
    .slice(0, 3);

  return (
    <div className="mx-auto w-full max-w-lg px-4 pb-6 space-y-4">
      {/* Greeting */}
      <CleanerPageHeader
        firstName={firstName || "there"}
        subline="You're online and ready to go."
      />

      {/* Availability + stats */}
      <AvailabilityCard
        receivingOffers={receivingOffers}
        rosterIncludesToday={rosterIncludesToday}
        browserOnline={browserOnline}
        onGoAvailable={() => void goAvailable()}
        onGoOffline={() => void goOffline()}
        availabilityBusy={availabilityBusy}
        jobsCount={openJobCount}
        ratingDisplay={ratingLabel}
        todayEarningsLabel={earningsSnapshot.todayZarLabel}
        idle={isIdle && confirmedIdle}
      />

      {/* Per-surface errors (non-blocking) */}
      {offersError ? (
        <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-700">
          Couldn&apos;t refresh offers — showing last loaded.
        </p>
      ) : null}
      {dashboardError ? (
        <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-700">
          Couldn&apos;t refresh dashboard — offers above are still live.
        </p>
      ) : null}
      {actionBanner ? (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-red-100 bg-red-50 px-3 py-2">
          <p className="text-sm text-red-700">{actionBanner}</p>
          <Button type="button" variant="ghost" size="sm" className="shrink-0 text-red-600" onClick={dismissActionBanner}>
            Dismiss
          </Button>
        </div>
      ) : null}

      {/* Pending offers */}
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

      {/* Active job hero */}
      {activeJob && activeJobRow ? (
        <ActiveJobHero
          job={activeJob}
          bookingRow={activeJobRow}
          mapsQuery={
            String(activeJobRow.location ?? "").trim()
              ? (String(activeJobRow.location).split(/\r?\n/)[0]?.trim() ?? String(activeJobRow.location))
              : null
          }
          clockOffsetMs={nextJobPinExtras.clockOffsetMs}
          onRowPatched={patchJobRow}
          onRefresh={() => void refreshDashboard()}
        />
      ) : null}

      {/* Next job card */}
      {!activeJob && nextHighlightedJob && nextHighlightedJobRow ? (
        <NextJobCard
          jobHref={nextHighlightedJob.href}
          bookingId={nextHighlightedJob.id}
          bookingRow={nextHighlightedJobRow}
          statusLabel={nextHighlightedJob.phaseDisplay}
          statusVariant={
            nextHighlightedJob.phaseDisplay.toLowerCase() === "in progress"
              ? "in-progress"
              : nextHighlightedJob.phaseDisplay.toLowerCase() === "en route"
                ? "starting-soon"
                : "assigned"
          }
          dateLabel={nextHighlightedJob.timeLine.split(" • ")[0] ?? ""}
          timeLabel={nextHighlightedJob.timeLine.split(" • ")[1] ?? ""}
          address={nextHighlightedJob.suburb}
          serviceLabel=""
          earningsLabel={formatCleanerJobEarningDisplay(nextHighlightedJob.jobEarning)}
          startsAtMs={nextJobPinExtras.startsAtMs}
          mapsQuery={nextJobPinExtras.mapsQuery}
          clockOffsetMs={nextJobPinExtras.clockOffsetMs}
          onRowPatched={patchJobRow}
          onRefresh={() => void refreshDashboard()}
        />
      ) : null}

      {/* Today's earnings */}
      <CleanerEarningsCard earnings={earningsSnapshot} />

      {/* Upcoming jobs */}
      {upcomingForHome.length > 0 ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-400">
              Upcoming Jobs
            </h2>
            <Link href="/jobs/list" className="text-xs font-semibold text-blue-600 hover:underline">
              View all
            </Link>
          </div>
          <div className="rounded-2xl border border-gray-100 bg-white shadow-sm divide-y divide-gray-50 overflow-hidden">
            {upcomingForHome.map((job) => (
              <Link
                key={job.id}
                href={job.href}
                className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-gray-50 active:bg-gray-50 transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-800 leading-tight">{job.timeLine}</p>
                  <p className="mt-0.5 text-xs text-slate-500">{job.suburb}</p>
                  <span className="mt-1 inline-block rounded-full bg-green-50 border border-green-100 px-2 py-0.5 text-xs font-semibold text-green-700">
                    EARNING {formatCleanerJobEarningDisplay(job.jobEarning)}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="rounded-full bg-blue-50 border border-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-700">
                    {job.phaseDisplay}
                  </span>
                  <span className="text-slate-300">›</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      ) : null}

      {/* Quick actions */}
      <QuickActionCard />

      {/* Activity feed */}
      <ActivityFeed entries={activityFeedDisplay} maxVisible={5} />

      {/* Empty state for offers section (accessibility anchor) */}
      {!hasPendingOffers ? (
        <JobOffersSection
          offers={offerCards}
          actingOfferId={actingOfferId}
          onAccept={(id, ux) => void acceptOffer(id, ux ?? null)}
          onDecline={(id) => void declineOffer(id)}
          onOfferExpired={removeOfferLocal}
        />
      ) : null}
    </div>
  );
}
