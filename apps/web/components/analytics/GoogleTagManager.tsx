import { scheduleThirdPartyScript } from "@/lib/analytics/deferThirdPartyScript";

const gtmId = process.env.NEXT_PUBLIC_GTM_ID?.trim();

/**
 * GTM bootstrap — deferred until idle / load. Set `NEXT_PUBLIC_GTM_ID` in production.
 */
export function GoogleTagManager() {
  if (!gtmId) return null;

  const id = JSON.stringify(gtmId);
  const bootstrap = scheduleThirdPartyScript(
    `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({"gtm.start":new Date().getTime(),event:"gtm.js"});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!="dataLayer"?"&l="+l:"";j.async=true;j.src="https://www.googletagmanager.com/gtm.js?id="+i+dl;f.parentNode.insertBefore(j,f);})(window,document,"script","dataLayer",${id});`,
  );

  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: bootstrap }} />
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
