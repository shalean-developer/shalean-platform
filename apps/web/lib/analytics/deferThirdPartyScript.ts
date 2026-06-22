/** Schedule third-party bootstrap after first paint (idle, or post-load fallback). */
export function scheduleThirdPartyScript(loadBody: string): string {
  return `(function(){var run=function(){${loadBody}};if("requestIdleCallback"in window){requestIdleCallback(run,{timeout:4000});}else{window.addEventListener("load",function(){setTimeout(run,1);},{once:true});}})();`;
}
