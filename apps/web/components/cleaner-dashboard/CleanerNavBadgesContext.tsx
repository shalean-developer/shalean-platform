"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

type CleanerNavBadgesValue = {
  openJobsCount: number;
  setOpenJobsCount: (n: number) => void;
};

const CleanerNavBadgesContext = createContext<CleanerNavBadgesValue | null>(null);

export function CleanerNavBadgesProvider({ children }: { children: ReactNode }) {
  const [openJobsCount, setOpenJobsCountState] = useState(0);
  const setOpenJobsCount = useCallback((n: number) => {
    setOpenJobsCountState(Number.isFinite(n) && n > 0 ? Math.floor(n) : 0);
  }, []);
  const value = useMemo(() => ({ openJobsCount, setOpenJobsCount }), [openJobsCount, setOpenJobsCount]);
  return <CleanerNavBadgesContext.Provider value={value}>{children}</CleanerNavBadgesContext.Provider>;
}

export function useCleanerNavBadges(): CleanerNavBadgesValue {
  const ctx = useContext(CleanerNavBadgesContext);
  return ctx ?? { openJobsCount: 0, setOpenJobsCount: () => {} };
}
