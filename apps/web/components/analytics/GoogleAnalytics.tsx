import { scheduleThirdPartyScript } from "@/lib/analytics/deferThirdPartyScript";

const gaMeasurementId =
  process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID?.trim() || "G-WRRDM9ELD7";

/**
 * GA4 gtag — queues events immediately but loads `gtag/js` after idle / load so LCP is not blocked.
 * Override with `NEXT_PUBLIC_GA_MEASUREMENT_ID`. If GTM also hits the same GA4 property, disable one path.
 */
export function GoogleAnalytics() {
  const id = JSON.stringify(gaMeasurementId);
  const bootstrap = [
    "window.dataLayer=window.dataLayer||[];",
    "function gtag(){dataLayer.push(arguments);}",
    "gtag('js',new Date());",
    scheduleThirdPartyScript(
      [
        `var s=document.createElement("script");`,
        `s.async=true;`,
        `s.src="https://www.googletagmanager.com/gtag/js?id="+encodeURIComponent(${id});`,
        `s.onload=function(){gtag("config",${id});};`,
        `document.head.appendChild(s);`,
      ].join(""),
    ),
  ].join("");

  return <script dangerouslySetInnerHTML={{ __html: bootstrap }} />;
}
