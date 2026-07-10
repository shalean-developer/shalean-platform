import { scheduleThirdPartyScript } from "@/lib/analytics/deferThirdPartyScript";

const pixelId = process.env.NEXT_PUBLIC_META_PIXEL_ID?.trim();

/**
 * Meta (Facebook) Pixel bootstrap — deferred until idle / load.
 * Set `NEXT_PUBLIC_META_PIXEL_ID` (e.g. 1234567890). Leave empty to disable.
 */
export function MetaPixel() {
  if (!pixelId) return null;

  const id = JSON.stringify(pixelId);
  const bootstrap = [
    "window.fbq=window.fbq||function(){(fbq.q=fbq.q||[]).push(arguments)};",
    "if(!window._fbq)window._fbq=fbq;",
    "fbq.push=fbq;fbq.loaded=!0;fbq.version='2.0';fbq.queue=[];",
    scheduleThirdPartyScript(
      [
        `var s=document.createElement("script");`,
        `s.async=true;`,
        `s.src="https://connect.facebook.net/en_US/fbevents.js";`,
        `s.onload=function(){fbq("init",${id});fbq("track","PageView");};`,
        `document.head.appendChild(s);`,
      ].join(""),
    ),
  ].join("");

  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: bootstrap }} />
      <noscript>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          height="1"
          width="1"
          style={{ display: "none" }}
          alt=""
          src={`https://www.facebook.com/tr?id=${encodeURIComponent(pixelId)}&ev=PageView&noscript=1`}
        />
      </noscript>
    </>
  );
}
