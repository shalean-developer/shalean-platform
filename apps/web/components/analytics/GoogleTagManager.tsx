import Script from "next/script";

const gtmId = process.env.NEXT_PUBLIC_GTM_ID?.trim();

/**
 * Official GTM bootstrap (loads `googletagmanager.com/gtm.js?id=…`).
 * Set `NEXT_PUBLIC_GTM_ID` in Vercel production (e.g. `GTM-5XRFHPL8`).
 */
export function GoogleTagManager() {
  if (!gtmId) return null;

  return (
    <>
      <Script
        id="google-tag-manager"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{
          __html: `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer',${JSON.stringify(gtmId)});`,
        }}
      />
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
