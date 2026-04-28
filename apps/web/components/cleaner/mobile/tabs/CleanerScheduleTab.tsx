"use client";

import type { ReactNode } from "react";
import type { CleanerBookingRow } from "@/lib/cleaner/cleanerBookingRow";
import { CleanerScheduleSection } from "@/components/cleaner/CleanerScheduleSection";

/**
 * Read-only schedule (no inline lifecycle actions). Prefer {@link CleanerScheduleSection} on the main workspace.
 * Pass `completionTrustBannerSlot` when the parent uses `useTrustCompletionBanner` with inline complete actions.
 */
export function CleanerScheduleTab({
  rows,
  now,
  loading,
  completionTrustBannerSlot,
  cleanerCreatedAtIso,
}: {
  rows: CleanerBookingRow[];
  now: Date;
  loading?: boolean;
  completionTrustBannerSlot?: ReactNode;
  cleanerCreatedAtIso?: string | null;
}) {
  return (
    <CleanerScheduleSection
      rows={rows}
      nowMs={now.getTime()}
      loading={loading}
      showLifecycleActions={false}
      completionTrustBannerSlot={completionTrustBannerSlot}
      cleanerCreatedAtIso={cleanerCreatedAtIso}
    />
  );
}
