"use client";

import { ReferralLandingView } from "@/components/referrals/ReferralLandingView";
import { ReferredFriendLandingView } from "@/components/referrals/ReferredFriendLandingView";
import { useReferralLandingAudience } from "@/hooks/useReferralLandingAudience";

export function ReferralLandingRouter() {
  const audience = useReferralLandingAudience();

  if (audience === "loading") {
    return (
      <div className="min-h-screen animate-pulse bg-white">
        <div className="h-16 bg-gray-100" />
        <div className="mx-auto max-w-4xl px-4 py-24">
          <div className="h-12 w-2/3 rounded-xl bg-gray-100" />
          <div className="mt-4 h-6 w-full rounded-lg bg-gray-50" />
        </div>
      </div>
    );
  }

  if (audience === "friend") {
    return <ReferredFriendLandingView />;
  }

  return <ReferralLandingView />;
}
