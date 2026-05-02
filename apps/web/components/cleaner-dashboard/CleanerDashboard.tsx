"use client";

import { useCleanerDashboardData } from "@/hooks/useCleanerDashboardData";
import { Button } from "@/components/ui/button";
import { EarningsCard } from "./EarningsCard";
import { Header } from "./Header";
import { JobOffersSection } from "./JobOffersSection";
import { UpcomingJobsSection } from "./UpcomingJobsSection";

export function CleanerDashboard() {
  const {
    loading,
    error,
    actionBanner,
    dismissActionBanner,
    offerCards,
    upcomingJobs,
    todayZarLabel,
    acceptOffer,
    declineOffer,
    actingOfferId,
    removeOfferLocal,
  } = useCleanerDashboardData();

  if (loading) {
    return (
      <div className="mx-auto flex min-h-[100dvh] w-full max-w-lg items-center justify-center bg-background p-4">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto min-h-[100dvh] w-full max-w-lg space-y-4 bg-background p-4 pb-10">
        <Header />
        <p className="text-sm text-destructive">{error}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto min-h-[100dvh] w-full max-w-lg space-y-6 bg-background p-4 pb-10">
      <Header />

      {actionBanner ? (
        <div className="flex items-start justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          <p className="min-w-0 flex-1">{actionBanner}</p>
          <Button type="button" variant="ghost" size="sm" className="shrink-0" onClick={dismissActionBanner}>
            Dismiss
          </Button>
        </div>
      ) : null}

      <JobOffersSection
        offers={offerCards}
        actingOfferId={actingOfferId}
        onAccept={(id, ux) => void acceptOffer(id, ux ?? null)}
        onDecline={(id) => void declineOffer(id)}
        onOfferExpired={removeOfferLocal}
      />

      <UpcomingJobsSection jobs={upcomingJobs} />

      <EarningsCard earnings={{ todayZarLabel }} />
    </div>
  );
}
