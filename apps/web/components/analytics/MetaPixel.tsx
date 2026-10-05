import { scheduleThirdPartyScript } from "@/lib/analytics/deferThirdPartyScript";
import { GA4_PATH_EXCLUSION_SNIPPET } from "@/lib/analytics/ga4Config";

const pixelId = process.env.NEXT_PUBLIC_META_PIXEL_ID?.trim();

/**
 * Meta (Facebook) Pixel bootstrap — deferred until idle / load.
 * Set `NEXT_PUBLIC_META_PIXEL_ID` (e.g. 1234567890). Leave empty to disable.
 */
export function MetaPixel() {
  if (!pixelId) return null;

  const id = JSON.stringify(pixelId);
  const bootstrap = [
    GA4_PATH_EXCLUSION_SNIPPET,
    "window.__shaleanMetaBootstrapScheduled=true;",
    "window.fbq=window.fbq||function(){(fbq.q=fbq.q||[]).push(arguments)};",
    "if(!window._fbq)window._fbq=fbq;",
    "fbq.push=fbq;fbq.loaded=!0;fbq.version='2.0';fbq.queue=[];",
    scheduleThirdPartyScript(
      [
        GA4_PATH_EXCLUSION_SNIPPET.replace(
          "return;",
          "window.__shaleanMetaBootstrapScheduled=false;return;",
        ),
        `if(window.__shaleanMetaBootstrapped)return;`,
        `if(document.querySelector('script[src*="connect.facebook.net/en_US/fbevents.js"]')){window.__shaleanMetaBootstrapped=true;return;}`,
        `var s=document.createElement("script");`,
        `s.async=true;`,
        `s.src="https://connect.facebook.net/en_US/fbevents.js";`,
        `s.onload=function(){window.__shaleanMetaBootstrapped=true;fbq("init",${id});fbq("track","PageView");};`,
        `s.onerror=function(){window.__shaleanMetaBootstrapScheduled=false;};`,
        `document.head.appendChild(s);`,
      ].join(""),
    ),
  ].join("");

  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: `(function(){${bootstrap}})();` }} />
    </>
  );
}
