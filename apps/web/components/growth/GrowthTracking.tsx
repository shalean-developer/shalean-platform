"use client";

import { useEffect } from "react";
import { markRetargetingCandidate, trackGrowthEvent, type GrowthEventType } from "@/lib/growth/trackEvent";

export function GrowthTracking({
  event,
  payload,
  markRetargeting = true,
}: {
  event: GrowthEventType;
  payload?: Record<string, unknown>;
  markRetargeting?: boolean;
}) {
  useEffect(() => {
    if (markRetargeting) markRetargetingCandidate(true);
    trackGrowthEvent(event, payload);
  }, [event, markRetargeting, payload]);

  return null;
}
