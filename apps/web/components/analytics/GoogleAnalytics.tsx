import { scheduleThirdPartyScript } from "@/lib/analytics/deferThirdPartyScript";
import {
  GA4_PATH_EXCLUSION_SNIPPET,
  getGa4MeasurementId,
} from "@/lib/analytics/ga4Config";

declare global {
  interface Window {
    __shaleanGa4Bootstrapped?: boolean;
  }
}

/**
 * GA4 gtag — queues events immediately but loads `gtag/js` after idle / load so LCP is not blocked.
 *
 * Canonical stream: https://shalean.co.za → `G-GEVTBDWTQW` (see `ga4Config.ts`).
 * Skips bootstrap entirely on `/office`, `/cleaner`, `/jobs` (and subpaths).
 * Override with `NEXT_PUBLIC_GA_MEASUREMENT_ID` (legacy www IDs are ignored).
 *
 * Critical: assign `window.gtag` inside the bootstrap so early client funnel events
 * (`booking_start`, `service_selected`, …) queue onto `dataLayer` before gtag.js loads.
 */
export function GoogleAnalytics() {
  const measurementId = getGa4MeasurementId();
  const id = JSON.stringify(measurementId);
  const bootstrap = [
    GA4_PATH_EXCLUSION_SNIPPET,
    "window.dataLayer=window.dataLayer||[];",
    // Expose on window — a bare `function gtag()` inside this IIFE would stay local and
    // early `trackGa4Event` calls would no-op until GoogleAds' deferred fallback ran.
    "window.gtag=window.gtag||function(){window.dataLayer.push(arguments);};",
    "window.gtag('js',new Date());",
    "window.__shaleanGa4Bootstrapped=true;",
    scheduleThirdPartyScript(
      [
        GA4_PATH_EXCLUSION_SNIPPET,
        `if(document.querySelector('script[data-shalean-ga4='+JSON.stringify(${id})+']'))return;`,
        `var s=document.createElement("script");`,
        `s.async=true;`,
        `s.dataset.shaleanGa4=${id};`,
        `s.src="https://www.googletagmanager.com/gtag/js?id="+encodeURIComponent(${id});`,
        `s.onload=function(){window.gtag("config",${id},{send_page_view:true,allow_enhanced_conversions:false});};`,
        `document.head.appendChild(s);`,
      ].join(""),
    ),
  ].join("");

  return <script dangerouslySetInnerHTML={{ __html: `(function(){${bootstrap}})();` }} />;
}

/** Pure bootstrap body for unit tests (no React). */
export function buildGoogleAnalyticsBootstrap(measurementId: string): string {
  const id = JSON.stringify(measurementId);
  return [
    GA4_PATH_EXCLUSION_SNIPPET,
    "window.dataLayer=window.dataLayer||[];",
    "window.gtag=window.gtag||function(){window.dataLayer.push(arguments);};",
    "window.gtag('js',new Date());",
    // Tests stub script load — keep config call synchronous for delivery proof.
    `window.gtag("config",${id},{send_page_view:true,allow_enhanced_conversions:false});`,
    "window.__shaleanGa4Bootstrapped=true;",
  ].join("");
}
