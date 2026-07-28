"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import {
  GA4_PATH_EXCLUSION_SNIPPET,
  getGa4MeasurementId,
  isGa4PathExcluded,
} from "@/lib/analytics/ga4Config";
import { setGa4Disabled } from "@/lib/analytics/ga4Events";

declare global {
  interface Window {
    __shaleanGa4Bootstrapped?: boolean;
  }
}

/**
 * Ensure gtag bootstrap exists after SPA navigation from an excluded route
 * (root layout script may have early-returned and never scheduled the loader).
 */
export function ensureGa4Bootstrapped(): void {
  if (typeof window === "undefined") return;
  if (isGa4PathExcluded(window.location.pathname)) return;
  if (window.__shaleanGa4Bootstrapped && typeof window.gtag === "function") return;

  const measurementId = getGa4MeasurementId();
  window.dataLayer = window.dataLayer || [];
  window.gtag =
    window.gtag ||
    function gtagStub() {
      // eslint-disable-next-line prefer-rest-params -- gtag Arguments API
      window.dataLayer!.push(arguments);
    };
  window.gtag("js", new Date());

  if (!document.querySelector(`script[data-shalean-ga4="${measurementId}"]`)) {
    const s = document.createElement("script");
    s.async = true;
    s.dataset.shaleanGa4 = measurementId;
    s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
    s.onload = () => {
      window.gtag?.("config", measurementId, {
        send_page_view: true,
        allow_enhanced_conversions: false,
      });
    };
    document.head.appendChild(s);
  }

  window.__shaleanGa4Bootstrapped = true;
  // Silence unused — documents parity with inline exclusion snippet.
  void GA4_PATH_EXCLUSION_SNIPPET;
}

/**
 * Client-route guard: when the SPA navigates onto /office|/cleaner|/jobs, disable GA4
 * (canonical + every legacy Measurement ID). When returning to a public route after a
 * hard-excluded first paint, bootstrap gtag if it was never loaded.
 */
export function Ga4RouteGuard() {
  const pathname = usePathname();
  const wasExcluded = useRef(false);

  useEffect(() => {
    const excluded = isGa4PathExcluded(pathname);
    setGa4Disabled(excluded);
    if (!excluded) {
      if (wasExcluded.current || typeof window.gtag !== "function") {
        ensureGa4Bootstrapped();
      }
    }
    wasExcluded.current = excluded;
  }, [pathname]);

  return null;
}
