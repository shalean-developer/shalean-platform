import { scheduleThirdPartyScript } from "@/lib/analytics/deferThirdPartyScript";
import {
  GA4_PATH_EXCLUSION_SNIPPET,
  getGa4MeasurementId,
} from "@/lib/analytics/ga4Config";

/**
 * GA4 gtag — queues events immediately but loads `gtag/js` after idle / load so LCP is not blocked.
 *
 * Canonical stream: https://shalean.co.za → `G-GEVTBDWTQW` (see `ga4Config.ts`).
 * Skips bootstrap entirely on `/office`, `/cleaner`, `/jobs` (and subpaths).
 * Override with `NEXT_PUBLIC_GA_MEASUREMENT_ID` (legacy www IDs are ignored).
 * If GTM also fires the same GA4 property, disable the duplicate page_view path in GTM.
 */
export function GoogleAnalytics() {
  const measurementId = getGa4MeasurementId();
  const id = JSON.stringify(measurementId);
  const bootstrap = [
    GA4_PATH_EXCLUSION_SNIPPET,
    "window.dataLayer=window.dataLayer||[];",
    "function gtag(){dataLayer.push(arguments);}",
    "gtag('js',new Date());",
    scheduleThirdPartyScript(
      [
        GA4_PATH_EXCLUSION_SNIPPET,
        `var s=document.createElement("script");`,
        `s.async=true;`,
        `s.src="https://www.googletagmanager.com/gtag/js?id="+encodeURIComponent(${id});`,
        `s.onload=function(){gtag("config",${id},{send_page_view:true,allow_enhanced_conversions:false});};`,
        `document.head.appendChild(s);`,
      ].join(""),
    ),
  ].join("");

  return <script dangerouslySetInnerHTML={{ __html: `(function(){${bootstrap}})();` }} />;
}
