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
    const run = () => {
      if (markRetargeting) markRetargetingCandidate(true);
      trackGrowthEvent(event, payload);
    };

    const timeoutId = window.setTimeout(run, 1500);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [event, markRetargeting, payload]);

  return null;
}