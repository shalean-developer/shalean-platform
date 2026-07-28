"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { isGa4PathExcluded } from "@/lib/analytics/ga4Config";
import { setGa4Disabled } from "@/lib/analytics/ga4Events";

/**
 * Client-route guard: when the SPA navigates onto /office|/cleaner|/jobs, disable GA4
 * (canonical + every legacy Measurement ID) so hits stop even if gtag was already loaded.
 */
export function Ga4RouteGuard() {
  const pathname = usePathname();

  useEffect(() => {
    setGa4Disabled(isGa4PathExcluded(pathname));
  }, [pathname]);

  return null;
}
