"use client";

import { PromotionCountdown } from "./PromotionCountdown";

type Props = {
  promotionId: string;
  endsAt: string | null;
};

export function CampaignLandingClient({ endsAt }: Props) {
  return (
    <div className="rounded-2xl bg-white/10 p-4 backdrop-blur-sm">
      <PromotionCountdown endsAt={endsAt} className="text-white" />
    </div>
  );
}
