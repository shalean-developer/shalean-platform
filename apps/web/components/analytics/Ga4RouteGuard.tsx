"use client";

import { useLayoutEffect, useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import {
  GA4_PATH_EXCLUSION_SNIPPET,
  getGa4ConfigOptions,
  getGa4MeasurementId,
  isGa4PathExcluded,
} from "@/lib/analytics/ga4Config";
import {
  applyAnalyticsRoutePolicy,
  installAnalyticsHistoryPolicyGuard,
  notifyAnalyticsTagLoaded,
  SHALEAN_ANALYTICS_TAG_LOADED_EVENT,
} from "@/lib/analytics/analyticsRoutePolicy";

declare global {
  interface Window {
    __shaleanGa4Bootstrapped?: boolean;
    __shaleanMetaBootstrapped?: boolean;
    __shaleanMetaBootstrapScheduled?: boolean;
    __shaleanClarityBootstrapped?: boolean;
    __shaleanClarityBootstrapScheduled?: boolean;
    __shaleanAhrefsBootstrapped?: boolean;
    __shaleanAhrefsBootstrapScheduled?: boolean;
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
  // Reapply route policy/guard after gtag.js may replace dataLayer.push.
  s.onload = () => notifyAnalyticsTagLoaded();
  document.head.appendChild(s);
  window.__shaleanGa4LoaderPresent = true;
}


function hasScriptSrcFragment(fragment: string): boolean {
  if (typeof document === "undefined") return false;
  return Array.from(document.querySelectorAll("script[src]")).some((el) =>
    String((el as HTMLScriptElement).src || "").includes(fragment),
  );
}

type MetaQueueFn = ((...args: unknown[]) => void) & {
  q?: unknown[];
  push?: MetaQueueFn;
  loaded?: boolean;
  version?: string;
  queue?: unknown[];
  callMethod?: (...args: unknown[]) => void;
};

type ClarityQueueFn = ((...args: unknown[]) => void) & { q?: unknown[] };

export function ensureMetaPixelBootstrapped(): void {
  if (typeof window === "undefined" || isGa4PathExcluded(window.location.pathname)) return;
  const pixelId = process.env.NEXT_PUBLIC_META_PIXEL_ID?.trim();
  if (!pixelId || window.__shaleanMetaBootstrapped || window.__shaleanMetaBootstrapScheduled) return;
  if (hasScriptSrcFragment("connect.facebook.net/en_US/fbevents.js")) {
    window.__shaleanMetaBootstrapped = true;
    return;
  }

  window.__shaleanMetaBootstrapScheduled = true;

  const w = window as Window & typeof globalThis & {
    fbq?: (...args: unknown[]) => void;
    _fbq?: unknown;
  };
  const existingFbq = w.fbq as MetaQueueFn | undefined;
  const fbq: MetaQueueFn =
    existingFbq ??
    ((...args: unknown[]) => {
      if (typeof fbq.callMethod === "function") {
        fbq.callMethod(...args);
        return;
      }
      fbq.queue = fbq.queue || [];
      fbq.queue.push(args);
    });
  w.fbq = fbq;
  if (!w._fbq) w._fbq = fbq;
  fbq.push = fbq;
  fbq.loaded = true;
  fbq.version = "2.0";
  fbq.queue = fbq.queue || [];

  const s = document.createElement("script");
  s.async = true;
  s.dataset.shaleanMeta = pixelId;
  s.src = "https://connect.facebook.net/en_US/fbevents.js";
  s.onload = () => {
    window.__shaleanMetaBootstrapped = true;
    w.fbq?.("init", pixelId);
    w.fbq?.("track", "PageView");
  };
  s.onerror = () => {
    window.__shaleanMetaBootstrapScheduled = false;
  };
  document.head.appendChild(s);
}

export function ensureClarityBootstrapped(): void {
  if (typeof window === "undefined" || isGa4PathExcluded(window.location.pathname)) return;
  const clarityId = process.env.NEXT_PUBLIC_MICROSOFT_CLARITY_PROJECT_ID?.trim();
  if (!clarityId || window.__shaleanClarityBootstrapped || window.__shaleanClarityBootstrapScheduled) return;
  if (hasScriptSrcFragment(`clarity.ms/tag/${clarityId}`)) {
    window.__shaleanClarityBootstrapped = true;
    return;
  }

  window.__shaleanClarityBootstrapScheduled = true;

  const w = window as Window & typeof globalThis & {
    clarity?: (...args: unknown[]) => void;
  };
  const existingClarity = w.clarity as ClarityQueueFn | undefined;
  const clarity: ClarityQueueFn =
    existingClarity ??
    ((...args: unknown[]) => {
      clarity.q = clarity.q || [];
      clarity.q.push(args);
    });
  w.clarity = clarity;

  const s = document.createElement("script");
  s.async = true;
  s.dataset.shaleanClarity = clarityId;
  s.src = `https://www.clarity.ms/tag/${encodeURIComponent(clarityId)}`;
  s.onload = () => {
    window.__shaleanClarityBootstrapped = true;
  };
  s.onerror = () => {
    window.__shaleanClarityBootstrapScheduled = false;
  };
  document.head.appendChild(s);
}

export function ensureAhrefsBootstrapped(): void {
  if (typeof window === "undefined" || isGa4PathExcluded(window.location.pathname)) return;
  if (window.__shaleanAhrefsBootstrapped || window.__shaleanAhrefsBootstrapScheduled) return;
  if (hasScriptSrcFragment("analytics.ahrefs.com/analytics.js")) {
    window.__shaleanAhrefsBootstrapped = true;
    return;
  }

  window.__shaleanAhrefsBootstrapScheduled = true;
  const s = document.createElement("script");
  s.async = true;
  s.dataset.key = "q/bjTagLIl4JOoJFbBFE/A";
  s.dataset.shaleanAhrefs = "1";
  s.src = "https://analytics.ahrefs.com/analytics.js";
  s.onload = () => {
    window.__shaleanAhrefsBootstrapped = true;
  };
  s.onerror = () => {
    window.__shaleanAhrefsBootstrapScheduled = false;
  };
  document.head.appendChild(s);
}

export function ensureNonGoogleTrackersBootstrapped(): void {
  ensureMetaPixelBootstrapped();
  ensureClarityBootstrapped();
  ensureAhrefsBootstrapped();
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
    applyAnalyticsRoutePolicy(window.location.pathname);
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
    applyAnalyticsRoutePolicy(window.location.pathname);
    return;
  }
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({ "gtm.start": new Date().getTime(), event: "gtm.js" });
  const s = document.createElement("script");
  s.async = true;
  s.dataset.shaleanGtm = gtmId;
  s.src = `https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(gtmId)}`;
  // Reapply route policy/guard after gtm.js may replace dataLayer.push.
  s.onload = () => notifyAnalyticsTagLoaded();
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
    ensureNonGoogleTrackersBootstrapped();
  }
}

/**
 * Client-route guard: when the SPA navigates onto /office|/jobs|private /cleaner, disable
 * GA4 (canonical + legacy), Google Ads (`AW-*`), and GTM dataLayer intake — including when
 * those tags were already loaded on a public route. `/cleaner/apply` stays eligible.
 * When returning to a public route after a hard-excluded first paint, bootstrap gtag / Ads /
 * GTM if they were never loaded.
 *
 * Uses `useLayoutEffect` and must mount **before** `{children}` in the root layout so
 * booking funnel effects cannot race ahead of disable-clear / bootstrap.
 */
export function shouldForceSensitiveRouteHardNavigation(
  pathname: string | null,
  wasPreviouslyExcluded: boolean,
): boolean {
  const path = pathname?.split("?")[0]?.split("#")[0] ?? "";
  return !wasPreviouslyExcluded && path === "/auth/reset-password";
}

export function Ga4RouteGuard() {
  const pathname = usePathname();
  const wasExcluded = useRef(isGa4PathExcluded(pathname));

  useLayoutEffect(() => {
    installAnalyticsHistoryPolicyGuard();
  }, []);

  useLayoutEffect(() => {
    const excluded = isGa4PathExcluded(pathname);

    if (shouldForceSensitiveRouteHardNavigation(pathname, wasExcluded.current)) {
      window.location.replace(window.location.href);
      return;
    }

    // Always silence (or restore) GA4 + Ads + GTM — including already-loaded destinations
    // after public → /office|/jobs|private /cleaner SPA navigation.
    applyAnalyticsRoutePolicy(pathname);
    if (!excluded && (wasExcluded.current || typeof window.gtag !== "function" || !window.__shaleanGa4Bootstrapped)) {
      ensureGa4Bootstrapped();
      ensureGoogleAdsBootstrapped();
      ensureGtmBootstrapped();
    }
    if (!excluded) {
      ensureNonGoogleTrackersBootstrapped();
    }
    wasExcluded.current = excluded;
  }, [pathname]);

  useEffect(() => {
    // Belt-and-suspenders: layout inline onload may only dispatch the event before the
    // module hook is bound; keep a listener so late CustomEvents still reapply policy.
    const onTagLoaded = () => applyAnalyticsRoutePolicy(window.location.pathname);
    window.addEventListener(SHALEAN_ANALYTICS_TAG_LOADED_EVENT, onTagLoaded);
    return () => window.removeEventListener(SHALEAN_ANALYTICS_TAG_LOADED_EVENT, onTagLoaded);
  }, []);

  return null;
}
