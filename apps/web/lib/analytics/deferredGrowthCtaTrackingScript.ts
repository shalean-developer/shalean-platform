import { scheduleThirdPartyScript } from "@/lib/analytics/deferThirdPartyScript";

/**
 * Delegated `start_booking` tracking for plain `<a data-growth-cta-source>` links (no client React boundary).
 * Registered after idle so hero LCP is not blocked.
 */
export function deferredGrowthCtaTrackingInlineScript(): string {
  const body = [
    'document.addEventListener("click",function(e){',
    'var t=e.target;if(!t||!t.closest)return;',
    'var el=t.closest("[data-growth-cta-source]");if(!el)return;',
    'var source=el.getAttribute("data-growth-cta-source");if(!source)return;',
    "function sid(){try{var k=\"shalean_analytics_session_id_v1\";var id=localStorage.getItem(k);",
    "if(id&&id.length>=8)return id;id=\"sess_\"+crypto.randomUUID();localStorage.setItem(k,id);",
    'document.cookie=k+"="+encodeURIComponent(id)+";path=/;max-age="+(60*60*24*400)+";SameSite=Lax";return id;',
    '}catch(err){return "sess_ephemeral_"+Date.now();}}',
    "function dev(){try{return window.matchMedia(\"(max-width: 1023px)\").matches?\"mobile\":\"desktop\";}catch(err){return \"desktop\";}}",
    'var s=sid();var payload=JSON.stringify({event_type:"start_booking",payload:{source:source,session_id:s,analytics_session_id:s,device:dev(),pathname:location.pathname,referrer:document.referrer||null}});',
    'try{if(navigator.sendBeacon){navigator.sendBeacon("/api/analytics/event",new Blob([payload],{type:"application/json"}));return;}}catch(err){}',
    'fetch("/api/analytics/event",{method:"POST",headers:{"Content-Type":"application/json"},body:payload,keepalive:true}).catch(function(){});',
    "},true);",
  ].join("");

  return scheduleThirdPartyScript(body);
}
