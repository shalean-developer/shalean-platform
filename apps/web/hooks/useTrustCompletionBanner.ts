"use client";

import { useCallback, useEffect, useState } from "react";
import type { TrustJobCompletionFeedback } from "@/lib/cleaner/trustJobCompletionFeedback";

export const TRUST_COMPLETION_BANNER_MS = 8000;

/**
 * Shared state for the post–**complete** trust banner (`CleanerJobCompletionTrustBanner`).
 * Use from job detail, workspace home, and (when lifecycle is enabled) {@link CleanerScheduleSection}
 * via `completionTrustBannerSlot={<CleanerJobCompletionTrustBanner feedback={trustCompletion} />}`.
 */
export function useTrustCompletionBanner(durationMs: number = TRUST_COMPLETION_BANNER_MS) {
  const [trustCompletion, setTrustCompletion] = useState<TrustJobCompletionFeedback | null>(null);

  useEffect(() => {
    if (!trustCompletion) return;
    const t = window.setTimeout(() => setTrustCompletion(null), durationMs);
    return () => window.clearTimeout(t);
  }, [trustCompletion, durationMs]);

  const showTrustCompletionBanner = useCallback((feedback: TrustJobCompletionFeedback) => {
    setTrustCompletion(feedback);
  }, []);

  const clearTrustCompletionBanner = useCallback(() => {
    setTrustCompletion(null);
  }, []);

  return { trustCompletion, showTrustCompletionBanner, clearTrustCompletionBanner };
}
