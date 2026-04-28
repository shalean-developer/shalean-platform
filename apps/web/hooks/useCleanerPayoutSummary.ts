"use client";

import { useContext } from "react";
import { CleanerEarningsDataContext } from "@/components/cleaner/CleanerEarningsDataProvider";

export type { CleanerPayoutSummary, CleanerPayoutSummaryRow } from "@/lib/cleaner/cleanerPayoutSummaryTypes";

export function useCleanerPayoutSummary() {
  const ctx = useContext(CleanerEarningsDataContext);
  if (!ctx) {
    throw new Error("useCleanerPayoutSummary must be used within CleanerEarningsDataProvider.");
  }
  return ctx;
}
