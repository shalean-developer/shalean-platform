"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

type CleanerNavBadgesValue = {
  /** Count of assigned jobs the cleaner currently has work on. Surfaced as the Jobs-tab badge. */
  openJobsCount: number;
  setOpenJobsCount: (n: number) => void;
  /**
   * Count of pending dispatch offers (not-yet-accepted) visible to this cleaner.
   * Surfaced as the Home-tab badge so a missed-SMS offer is impossible to miss
   * regardless of which page the cleaner is currently on.
   */
  pendingOffersCount: number;
  setPendingOffersCount: (n: number) => void;
};

const CleanerNavBadgesContext = createContext<CleanerNavBadgesValue | null>(null);

function clampNonNegInt(n: number): number {
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

export function CleanerNavBadgesProvider({ children }: { children: ReactNode }) {
  const [openJobsCount, setOpenJobsCountState] = useState(0);
  const [pendingOffersCount, setPendingOffersCountState] = useState(0);
  const setOpenJobsCount = useCallback((n: number) => {
    setOpenJobsCountState(clampNonNegInt(n));
  }, []);
  const setPendingOffersCount = useCallback((n: number) => {
    setPendingOffersCountState(clampNonNegInt(n));
  }, []);
  const value = useMemo(
    () => ({ openJobsCount, setOpenJobsCount, pendingOffersCount, setPendingOffersCount }),
    [openJobsCount, setOpenJobsCount, pendingOffersCount, setPendingOffersCount],
  );
  return <CleanerNavBadgesContext.Provider value={value}>{children}</CleanerNavBadgesContext.Provider>;
}

export function useCleanerNavBadges(): CleanerNavBadgesValue {
  const ctx = useContext(CleanerNavBadgesContext);
  return (
    ctx ?? {
      openJobsCount: 0,
      setOpenJobsCount: () => {},
      pendingOffersCount: 0,
      setPendingOffersCount: () => {},
    }
  );
}
