import { scheduleThirdPartyScript } from "@/lib/analytics/deferThirdPartyScript";
import { GA4_PATH_EXCLUSION_SNIPPET } from "@/lib/analytics/ga4Config";

const clarityProjectId = process.env.NEXT_PUBLIC_MICROSOFT_CLARITY_PROJECT_ID?.trim();

/** Microsoft Clarity — deferred third-party bootstrap (no client boundary in root layout). */
export function SessionReplayProvider() {
  if (!clarityProjectId) return null;

  const id = JSON.stringify(clarityProjectId);
  const bootstrap = [
    GA4_PATH_EXCLUSION_SNIPPET,
    "window.__shaleanClarityBootstrapScheduled=true;",
    scheduleThirdPartyScript(
      `${GA4_PATH_EXCLUSION_SNIPPET.replace(
        "return;",
        "window.__shaleanClarityBootstrapScheduled=false;return;",
      )}if(window.__shaleanClarityBootstrapped)return;if(document.querySelector('script[src*="clarity.ms/tag/"]')){window.__shaleanClarityBootstrapped=true;return;}(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;t.onload=function(){window.__shaleanClarityBootstrapped=true;};t.onerror=function(){window.__shaleanClarityBootstrapScheduled=false;};y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);})(window,document,"clarity","script",${id});`,
    ),
  ].join("");

  return <script dangerouslySetInnerHTML={{ __html: `(function(){${bootstrap}})();` }} />;
}
