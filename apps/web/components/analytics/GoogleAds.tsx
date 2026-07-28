import { scheduleThirdPartyScript } from "@/lib/analytics/deferThirdPartyScript";
import { GA4_PATH_EXCLUSION_SNIPPET } from "@/lib/analytics/ga4Config";

const adsId = process.env.NEXT_PUBLIC_GOOGLE_ADS_ID?.trim() || "AW-11050850519";

/**
 * Google Ads gtag config (`AW-…`) — deferred.
 * Default `AW-11050850519` (Shalean Cleaning Services). Override with `NEXT_PUBLIC_GOOGLE_ADS_ID`.
 * Purchase conversions also need `NEXT_PUBLIC_GOOGLE_ADS_PURCHASE_LABEL` (see trackClientPurchase).
 * Queues `gtag('config')` on the shared dataLayer (loaded by GoogleAnalytics).
 * Skipped on `/office`, `/cleaner`, `/jobs`.
 */
export function GoogleAds() {
  if (!adsId) return null;

  const id = JSON.stringify(adsId);
  const bootstrap = scheduleThirdPartyScript(
    [
      GA4_PATH_EXCLUSION_SNIPPET,
      `window.dataLayer=window.dataLayer||[];`,
      `window.gtag=window.gtag||function(){window.dataLayer.push(arguments);};`,
      `window.gtag("config",${id});`,
    ].join(""),
  );

  return <script dangerouslySetInnerHTML={{ __html: `(function(){${bootstrap}})();` }} />;
}
