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
    __shaleanAdsBootstrapped?: boolean;
    __shaleanGtmBootstrapped?: boolean;
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
  window.gtag("config", measurementId, {
    send_page_view: true,
    allow_enhanced_conversions: false,
  });

  if (!document.querySelector(`script[data-shalean-ga4="${measurementId}"]`)) {
    const s = document.createElement("script");
    s.async = true;
    s.dataset.shaleanGa4 = measurementId;
    s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
    document.head.appendChild(s);
  }

  window.__shaleanGa4Bootstrapped = true;
  // Silence unused — documents parity with inline exclusion snippet.
  void GA4_PATH_EXCLUSION_SNIPPET;
}

/** Queue Google Ads config after leaving an excluded hard-load (layout scripts may have no-op'd). */
export function ensureGoogleAdsBootstrapped(): void {
  if (typeof window === "undefined") return;
  if (isGa4PathExcluded(window.location.pathname)) return;
  if (window.__shaleanAdsBootstrapped) return;
  const adsId = process.env.NEXT_PUBLIC_GOOGLE_ADS_ID?.trim() || "AW-11050850519";
  if (!adsId) return;
  window.dataLayer = window.dataLayer || [];
  window.gtag =
    window.gtag ||
    function gtagStub() {
      // eslint-disable-next-line prefer-rest-params -- gtag Arguments API
      window.dataLayer!.push(arguments);
    };
  window.gtag("config", adsId);
  window.__shaleanAdsBootstrapped = true;
}

/** Load GTM after leaving an excluded hard-load when the idle callback previously returned early. */
export function ensureGtmBootstrapped(): void {
  if (typeof window === "undefined") return;
  if (isGa4PathExcluded(window.location.pathname)) return;
  if (window.__shaleanGtmBootstrapped) return;
  const gtmId = process.env.NEXT_PUBLIC_GTM_ID?.trim();
  if (!gtmId) return;
  if (document.querySelector(`script[data-shalean-gtm="${gtmId}"]`)) {
    window.__shaleanGtmBootstrapped = true;
    return;
  }
  if (
    Array.from(document.querySelectorAll("script[src]")).some((el) =>
      String((el as HTMLScriptElement).src || "").includes(
        `googletagmanager.com/gtm.js?id=${encodeURIComponent(gtmId)}`,
      ),
    )
  ) {
    window.__shaleanGtmBootstrapped = true;
    return;
  }
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({ "gtm.start": new Date().getTime(), event: "gtm.js" });
  const s = document.createElement("script");
  s.async = true;
  s.dataset.shaleanGtm = gtmId;
  s.src = `https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(gtmId)}`;
  document.head.appendChild(s);
  window.__shaleanGtmBootstrapped = true;
}

/**
 * Client-route guard: when the SPA navigates onto /office|/cleaner|/jobs, disable GA4
 * (canonical + every legacy Measurement ID). When returning to a public route after a
 * hard-excluded first paint, bootstrap gtag / Ads / GTM if they were never loaded.
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
        ensureGoogleAdsBootstrapped();
        ensureGtmBootstrapped();
      }
    }
    wasExcluded.current = excluded;
  }, [pathname]);

  return null;
}
