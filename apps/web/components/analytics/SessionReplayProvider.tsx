import { scheduleThirdPartyScript } from "@/lib/analytics/deferThirdPartyScript";

const clarityProjectId = process.env.NEXT_PUBLIC_MICROSOFT_CLARITY_PROJECT_ID?.trim();

/** Microsoft Clarity — deferred third-party bootstrap (no client boundary in root layout). */
export function SessionReplayProvider() {
  if (!clarityProjectId) return null;

  const id = JSON.stringify(clarityProjectId);
  const bootstrap = scheduleThirdPartyScript(
    `(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);})(window,document,"clarity","script",${id});`,
  );

  return <script dangerouslySetInnerHTML={{ __html: bootstrap }} />;
}
