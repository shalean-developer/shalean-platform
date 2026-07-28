"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { getGa4MeasurementId, isGa4PathExcluded } from "@/lib/analytics/ga4Config";
import { setGa4Disabled } from "@/lib/analytics/ga4Events";

/**
 * Client-route guard: when the SPA navigates onto /office|/cleaner|/jobs, disable GA4
 * so queued events stop sending even if gtag was already loaded from a public page.
 */
export function Ga4RouteGuard() {
  const pathname = usePathname();

  useEffect(() => {
    const excluded = isGa4PathExcluded(pathname);
    setGa4Disabled(excluded);
    if (excluded && typeof window !== "undefined") {
      const id = getGa4MeasurementId();
      (window as unknown as Record<string, boolean>)[`ga-disable-${id}`] = true;
    }
  }, [pathname]);

  return null;
}
