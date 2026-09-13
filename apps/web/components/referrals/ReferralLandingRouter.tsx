"use client";

import { PublicPageContainer } from "@/components/nav/PublicPageContainer";
import { ReferralLandingView } from "@/components/referrals/ReferralLandingView";
import { ReferredFriendLandingView } from "@/components/referrals/ReferredFriendLandingView";
import { useReferralLandingAudience } from "@/hooks/useReferralLandingAudience";

export function ReferralLandingRouter() {
  const audience = useReferralLandingAudience();

  if (audience === "loading") {
    return (
      <div className="min-h-screen animate-pulse bg-background text-foreground">
        <div className="h-16 border-b border-border bg-card" />
        <PublicPageContainer size="content" className="py-24">
          <div className="h-12 w-2/3 rounded-[var(--ui-radius-xl)] bg-muted" />
          <div className="mt-4 h-6 w-full rounded-[var(--ui-radius-lg)] bg-muted/60" />
        </PublicPageContainer>
      </div>
    );
  }

  if (audience === "friend") {
    return <ReferredFriendLandingView />;
  }

  return <ReferralLandingView />;
}
