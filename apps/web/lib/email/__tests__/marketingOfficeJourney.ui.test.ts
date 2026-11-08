// @vitest-environment jsdom
import {afterEach,beforeEach,expect,it,vi} from "vitest";
import React,{act} from "react";
import {createRoot,type Root} from "react-dom/client";
const m=vi.hoisted(()=>({session:vi.fn()}));
vi.mock("@/lib/supabaseClient",()=>({getSupabaseClient:()=>({auth:{getSession:m.session}})}));
import {MarketingEmailStagingJourney} from "@/components/account/MarketingEmailStagingJourney";
let host:HTMLDivElement,root:Root;
beforeEach(()=>{Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});m.session.mockResolvedValue({data:{session:{access_token:"synthetic-owner-session"}}});host=document.createElement("div");document.body.appendChild(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals();});
function fixtureTransport(failWithdrawal=false){
 const current={generation:3,evidenceCount:10,decision:"withdrawn",unsubscribedAt:"2026-11-08T00:00:00Z" as string|null,reconciliation:[{status:"pending",claimFingerprint:null as string|null,lease_expires_at:null as string|null}],enrollment:[]};
 const tokens=new Map<string,number>(),used=new Set<string>();let issuance=0;
 const fetcher=vi.fn(async(input:string|URL,init?:RequestInit)=>{
  const url=new URL(String(input),window.location.origin),post=init?.method==="POST";
  if(url.pathname==="/api/marketing/unsubscribe"){
   const token=url.searchParams.get("token")!;
   if(!post)return new Response(token==="legacy"?"<p>Confirm in account</p>":"Unsubscribe from marketing emails");
   if(token==="legacy")return Response.json({}, {status:409});
   if(!tokens.has(token))return Response.json({}, {status:400});
   if(tokens.get(token)!==current.generation)return Response.json({}, {status:409});
   if(failWithdrawal){failWithdrawal=false;return Response.json({}, {status:503});}
   if(!used.has(token)){used.add(token);current.evidenceCount++;}
   current.decision="withdrawn";current.unsubscribedAt="2026-11-08T00:00:00Z";
   return Response.json({ok:true});
  }
  if(url.pathname!=="/api/admin/email/rehearsal")throw Error("Owner UI must not use customer preference APIs");
  if(!post)return Response.json(current);
  const body=JSON.parse(String(init?.body));
  if(body.action==="issue_links"){
   const token=`token-${current.generation}-${++issuance}`,unused=`unused-${current.generation}-${issuance}`;tokens.set(token,current.generation);tokens.set(unused,current.generation);
   const link=(value:string)=>window.location.origin+"/api/marketing/unsubscribe?token="+value;
   return Response.json({url:link(token),unusedUrl:link(unused),legacyUrl:link("legacy")});
  }
  if(body.action==="prepare_replay")current.reconciliation=[{status:body.state,claimFingerprint:body.state==="processing"?"synthetic-claim":null,lease_expires_at:body.state==="processing"?"2099-01-01T00:00:00Z":null}];
  if(body.action==="prepare_partial")current.unsubscribedAt=null;
  if(body.action==="record_grant"){current.generation++;current.evidenceCount++;current.decision="granted";}
  if(body.action==="record_withdrawal"){current.evidenceCount++;current.decision="withdrawn";current.unsubscribedAt="2026-11-08T00:00:00Z";}
  return Response.json({ok:true});
 });
 vi.stubGlobal("fetch",fetcher);return {fetcher,current};
}
async function run(){
 await act(async()=>{root.render(React.createElement(MarketingEmailStagingJourney,{mode:"office"}));});
 await act(async()=>{(host.querySelector('input[type="checkbox"]') as HTMLInputElement).click();});
 await act(async()=>{host.querySelector("button")!.click();});
}
it("executes all eleven owner checks without reading or changing the owner's customer preferences",async()=>{
 const f=fixtureTransport();await run();
 const rows=[...host.querySelectorAll("ol li")].map(el=>el.textContent);
 expect(rows).toHaveLength(11);expect(rows.every(row=>row?.startsWith("PASS"))).toBe(true);expect(new Set(rows).size).toBe(11);
 expect(f.current).toMatchObject({generation:4,evidenceCount:13,decision:"withdrawn"});
 expect(f.fetcher.mock.calls.some(([url])=>String(url).includes("/api/me/"))).toBe(false);
 expect(host.querySelector('[role="alert"]')).toBeNull();
 expect(host.querySelector('a[href="/office/marketing/email"]')).not.toBeNull();
});
it("uses only the fixture-specific Office cleanup action when a check fails",async()=>{
 const f=fixtureTransport(true);await run();
 const actions=f.fetcher.mock.calls.filter(([,init])=>init?.method==="POST"&&typeof init?.body==="string").map(([,init])=>JSON.parse(String(init?.body)).action).filter(Boolean);
 expect(actions).toContain("record_withdrawal");expect(f.current.decision).toBe("withdrawn");
 expect(f.fetcher.mock.calls.some(([url])=>String(url).includes("/api/me/"))).toBe(false);
 expect(host.querySelector('[role="alert"]')?.textContent).toContain("It is not marked passed");
});
