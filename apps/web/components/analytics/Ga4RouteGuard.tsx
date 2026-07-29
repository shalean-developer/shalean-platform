"use client";

import { useLayoutEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import {
  GA4_PATH_EXCLUSION_SNIPPET,
  getGa4ConfigOptions,
  getGa4MeasurementId,
  isGa4PathExcluded,
} from "@/lib/analytics/ga4Config";
import { applyAnalyticsRoutePolicy } from "@/lib/analytics/analyticsRoutePolicy";

declare global {
  interface Window {
    __shaleanGa4Bootstrapped?: boolean;
    /** True once gtag.js has been appended (or detected) — distinct from config queue. */
    __shaleanGa4LoaderPresent?: boolean;
    __shaleanAdsBootstrapped?: boolean;
    __shaleanGtmBootstrapped?: boolean;
  }
}

function hasGa4LoaderScript(measurementId: string): boolean {
  if (typeof window !== "undefined" && window.__shaleanGa4LoaderPresent) return true;
  if (typeof document === "undefined") return false;
  if (document.querySelector(`script[data-shalean-ga4="${measurementId}"]`)) {
    window.__shaleanGa4LoaderPresent = true;
    return true;
  }
  const needle = `googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
  const found = Array.from(document.querySelectorAll("script[src]")).some((el) =>
    String((el as HTMLScriptElement).src || "").includes(needle),
  );
  if (found) window.__shaleanGa4LoaderPresent = true;
  return found;
}

function appendGa4LoaderScript(measurementId: string): void {
  if (hasGa4LoaderScript(measurementId)) return;
  const s = document.createElement("script");
  s.async = true;
  s.dataset.shaleanGa4 = measurementId;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
  document.head.appendChild(s);
  window.__shaleanGa4LoaderPresent = true;
}

/**
 * Ensure gtag bootstrap exists after SPA navigation from an excluded route
 * (root layout script may have early-returned and never scheduled the loader).
 * Idempotent: never appends a second gtag.js or re-queues config/page_view.
 */
export function ensureGa4Bootstrapped(): void {
  if (typeof window === "undefined") return;
  if (isGa4PathExcluded(window.location.pathname)) return;

  const measurementId = getGa4MeasurementId();
  window.dataLayer = window.dataLayer || [];
  window.gtag =
    window.gtag ||
    function gtagStub() {
      // eslint-disable-next-line prefer-rest-params -- gtag Arguments API
      window.dataLayer!.push(arguments);
    };

  const loaderPresent = hasGa4LoaderScript(measurementId);

  // Config already queued (hard-load / prior bootstrap) — never re-queue config/page_view.
  // Still append gtag.js if the deferred idle loader was skipped on an excluded route.
  if (window.__shaleanGa4Bootstrapped || loaderPresent) {
    window.__shaleanGa4Bootstrapped = true;
    appendGa4LoaderScript(measurementId);
    return;
  }

  window.gtag("js", new Date());
  window.gtag("config", measurementId, getGa4ConfigOptions());

  appendGa4LoaderScript(measurementId);

  window.__shaleanGa4Bootstrapped = true;
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
 * Apply path policy synchronously (layout phase) so booking funnel effects that run
 * in the same navigation commit see cleared disable flags and a queued gtag.
 */
export function syncGa4RoutePolicy(pathname: string | null): void {
  applyAnalyticsRoutePolicy(pathname);
  if (!isGa4PathExcluded(pathname)) {
    ensureGa4Bootstrapped();
    ensureGoogleAdsBootstrapped();
    ensureGtmBootstrapped();
  }
}

/**
 * Client-route guard: when the SPA navigates onto /office|/cleaner|/jobs, disable GA4
 * (canonical + every legacy Measurement ID). When returning to a public route after a
 * hard-excluded first paint, bootstrap gtag / Ads / GTM if they were never loaded.
 *
 * Uses `useLayoutEffect` and must mount **before** `{children}` in the root layout so
 * booking funnel effects cannot race ahead of disable-clear / bootstrap.
 */
export function Ga4RouteGuard() {
  const pathname = usePathname();
  const wasExcluded = useRef(isGa4PathExcluded(pathname));

  useLayoutEffect(() => {
    const excluded = isGa4PathExcluded(pathname);
    applyAnalyticsRoutePolicy(pathname);
    if (!excluded && (wasExcluded.current || typeof window.gtag !== "function" || !window.__shaleanGa4Bootstrapped)) {
      ensureGa4Bootstrapped();
      ensureGoogleAdsBootstrapped();
      ensureGtmBootstrapped();
    }
    wasExcluded.current = excluded;
  }, [pathname]);

  return null;
}
