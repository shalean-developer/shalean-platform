import { scheduleThirdPartyScript } from "@/lib/analytics/deferThirdPartyScript";
import { GA4_PATH_EXCLUSION_SNIPPET } from "@/lib/analytics/ga4Config";

const gtmId = process.env.NEXT_PUBLIC_GTM_ID?.trim();

/**
 * GTM bootstrap — deferred until idle / load. Set `NEXT_PUBLIC_GTM_ID` in production.
 * Skips on `/office`, `/cleaner`, `/jobs` so GTM cannot re-introduce a second GA4 stream
 * on internal surfaces.
 *
 * No noscript GTM iframe here: the root layout is shared and cannot path-gate
 * fallback markup without per-request server pathname (middleware header).
 *
 * Ops: ensure the GTM container's GA4 Configuration tag uses only `G-GEVTBDWTQW`
 * (apex shalean.co.za). Do not add `G-6JR2GPGPN3` or other www-linked Measurement IDs.
 * SPA route changes publish `shalean_analytics_route_eligible` on dataLayer; gate
 * tags with an exception trigger when that value is false (see analyticsRoutePolicy.ts).
 */
export function GoogleTagManager() {
  if (!gtmId) return null;

  const id = JSON.stringify(gtmId);
  const bootstrap = scheduleThirdPartyScript(
    [
      GA4_PATH_EXCLUSION_SNIPPET,
      `if(window.__shaleanGtmBootstrapped)return;`,
      // JSON.stringify(id) yields a quoted attribute selector: [data-shalean-gtm="GTM-…"]
      `if(document.querySelector('script[data-shalean-gtm='+JSON.stringify(${id})+']')){window.__shaleanGtmBootstrapped=true;return;}`,
      `if([].some.call(document.querySelectorAll('script[src]'),function(el){return String(el.src||'').indexOf('googletagmanager.com/gtm.js?id='+encodeURIComponent(${id}))!==-1;})){window.__shaleanGtmBootstrapped=true;return;}`,
      `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({"gtm.start":new Date().getTime(),event:"gtm.js"});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!="dataLayer"?"&l="+l:"";j.async=true;j.dataset.shaleanGtm=i;j.src="https://www.googletagmanager.com/gtm.js?id="+i+dl;j.onload=function(){try{if(typeof w.__shaleanNotifyAnalyticsTagLoaded==="function"){w.__shaleanNotifyAnalyticsTagLoaded();}else{w.dispatchEvent(new CustomEvent("shalean:analytics-tag-loaded"));}}catch(e){}};f.parentNode.insertBefore(j,f);w.__shaleanGtmBootstrapped=true;})(window,document,"script","dataLayer",${id});`,
    ].join(""),
  );

  return (
    <script dangerouslySetInnerHTML={{ __html: `(function(){${bootstrap}})();` }} />
  );
}
