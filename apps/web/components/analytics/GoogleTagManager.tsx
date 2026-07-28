import { scheduleThirdPartyScript } from "@/lib/analytics/deferThirdPartyScript";
import { GA4_PATH_EXCLUSION_SNIPPET } from "@/lib/analytics/ga4Config";

const gtmId = process.env.NEXT_PUBLIC_GTM_ID?.trim();

/**
 * GTM bootstrap — deferred until idle / load. Set `NEXT_PUBLIC_GTM_ID` in production.
 * Skips on `/office`, `/cleaner`, `/jobs` so GTM cannot re-introduce a second GA4 stream
 * on internal surfaces.
 *
 * Ops: ensure the GTM container's GA4 Configuration tag uses only `G-GEVTBDWTQW`
 * (apex shalean.co.za). Do not add `G-6JR2GPGPN3` or other www-linked Measurement IDs.
 */
export function GoogleTagManager() {
  if (!gtmId) return null;

  const id = JSON.stringify(gtmId);
  const bootstrap = scheduleThirdPartyScript(
    [
      GA4_PATH_EXCLUSION_SNIPPET,
      `if(window.__shaleanGtmBootstrapped)return;`,
      `if(document.querySelector('script[data-shalean-gtm='+${id}+']')){window.__shaleanGtmBootstrapped=true;return;}`,
      `if([].some.call(document.querySelectorAll('script[src]'),function(el){return String(el.src||'').indexOf('googletagmanager.com/gtm.js?id='+encodeURIComponent(${id}))!==-1;})){window.__shaleanGtmBootstrapped=true;return;}`,
      `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({"gtm.start":new Date().getTime(),event:"gtm.js"});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!="dataLayer"?"&l="+l:"";j.async=true;j.dataset.shaleanGtm=i;j.src="https://www.googletagmanager.com/gtm.js?id="+i+dl;f.parentNode.insertBefore(j,f);w.__shaleanGtmBootstrapped=true;})(window,document,"script","dataLayer",${id});`,
    ].join(""),
  );

  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: `(function(){${bootstrap}})();` }} />
      <noscript>
        <iframe
          src={`https://www.googletagmanager.com/ns.html?id=${encodeURIComponent(gtmId)}`}
          height="0"
          width="0"
          style={{ display: "none", visibility: "hidden" }}
          title="Google Tag Manager"
        />
      </noscript>
    </>
  );
}
