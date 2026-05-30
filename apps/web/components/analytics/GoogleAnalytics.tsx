import Script from "next/script";

const gaMeasurementId =
  process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID?.trim() || "G-WRRDM9ELD7";

/**
 * Official GA4 gtag bootstrap in `<head>` (default measurement id `G-WRRDM9ELD7`).
 * Override with `NEXT_PUBLIC_GA_MEASUREMENT_ID`. If GTM also sends hits to the same GA4 property, disable one path to avoid duplicate pageviews.
 */
export function GoogleAnalytics() {

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(gaMeasurementId)}`}
        strategy="afterInteractive"
      />
      <Script
        id="google-analytics-config"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{
          __html: `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config',${JSON.stringify(gaMeasurementId)});`,
        }}
      />
    </>
  );
}
