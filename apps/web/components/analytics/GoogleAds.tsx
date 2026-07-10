import { scheduleThirdPartyScript } from "@/lib/analytics/deferThirdPartyScript";

const adsId = process.env.NEXT_PUBLIC_GOOGLE_ADS_ID?.trim();

/**
 * Google Ads gtag config (`AW-…`) — deferred. Requires `NEXT_PUBLIC_GOOGLE_ADS_ID`.
 * Purchase conversions also need `NEXT_PUBLIC_GOOGLE_ADS_PURCHASE_LABEL` (see trackClientPurchase).
 * Queues `gtag('config')` on the shared dataLayer (loaded by GoogleAnalytics).
 */
export function GoogleAds() {
  if (!adsId) return null;

  const id = JSON.stringify(adsId);
  const bootstrap = scheduleThirdPartyScript(
    [
      `window.dataLayer=window.dataLayer||[];`,
      `window.gtag=window.gtag||function(){dataLayer.push(arguments);};`,
      `gtag("config",${id});`,
    ].join(""),
  );

  return <script dangerouslySetInnerHTML={{ __html: bootstrap }} />;
}
