// @vitest-environment jsdom
import {afterEach,beforeEach,expect,it,vi} from "vitest";
import React,{act} from "react";
import {createRoot,type Root} from "react-dom/client";
import {roleGuardDestination} from "@/lib/auth/roleGuardDestination";
import {policyForOfficePath} from "@/lib/admin/officeExperience";
const m=vi.hoisted(()=>({session:vi.fn()}));
vi.mock("@/hooks/useUser",()=>({useUser:()=>({user:{id:"operator"},loading:false})}));
vi.mock("@/lib/supabaseClient",()=>({getSupabaseClient:()=>({auth:{getSession:m.session}})}));
vi.mock("@/components/account/MarketingEmailStagingJourney",()=>({MarketingEmailTestLink:()=>null}));
import {MarketingEmailPreferences} from "@/components/account/MarketingEmailPreferences";
let host:HTMLDivElement,root:Root;
beforeEach(()=>{Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});m.session.mockResolvedValue({data:{session:{access_token:"synthetic-session"}}});host=document.createElement("div");document.body.appendChild(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals();});
const entry={requiredRole:"customer",actualRole:"admin",actualRoute:"/office",pathname:"/account/profile",appEnv:"staging",hostname:"pricing-test.shalean.co.za"} as const;
it("routes the exact staging admin profile handoff to the Owner-gated preference page",()=>{
 expect(roleGuardDestination(entry)).toBe("/office/marketing/email/preferences");
 expect(policyForOfficePath(roleGuardDestination(entry))).toMatchObject({anyOf:["system.settings"],audience:["owner"]});
 for(const changed of [{appEnv:"production"},{hostname:"shalean.co.za"},{pathname:"/account/bookings"},{actualRole:"cleaner" as const,actualRoute:"/jobs"},{requiredRole:"cleaner" as const}])expect(roleGuardDestination({...entry,...changed})).toBe(changed.actualRoute??"/office");
});
it("requires explicit fixture authorization, changes only the Office fixture and displays persisted paused status",async()=>{
 let decision="withdrawn";const fetcher=vi.fn(async(url:string,init?:RequestInit)=>{
  expect(url).toBe("/api/admin/email/rehearsal");
  if(init?.method==="POST"){const body=JSON.parse(String(init.body));expect(Object.keys(body)).toEqual(["action"]);decision=body.action==="record_grant"?"granted":"withdrawn";return Response.json({ok:true});}
  return Response.json({decision,unsubscribedAt:"2026-11-08T00:00:00Z"});
 });vi.stubGlobal("fetch",fetcher);
 await act(async()=>{root.render(React.createElement(MarketingEmailPreferences,{mode:"office"}));});
 const buttons=host.querySelectorAll("button");expect([...buttons].every(b=>b.disabled)).toBe(true);
 await act(async()=>{(host.querySelector("input") as HTMLInputElement).click();});
 await act(async()=>buttons[0]!.click());
 expect(host.textContent).toContain("Promotional delivery remains paused");expect([...buttons].every(b=>b.disabled)).toBe(true);
 await act(async()=>{(host.querySelector("input") as HTMLInputElement).click();});await act(async()=>buttons[1]!.click());
 expect(host.textContent).toContain("Unsubscribed from marketing emails.");expect(host.textContent).toContain("your own preferences are unchanged");
 expect(fetcher.mock.calls.filter(([,i])=>i?.method==="POST").map(([,i])=>JSON.parse(String(i?.body)))).toEqual([{action:"record_grant"},{action:"record_withdrawal"}]);
});
it("keeps customer requests on the self-only API and requires affirmative opt-in",async()=>{
 let status="no_consent";const fetcher=vi.fn(async(url:string,init?:RequestInit)=>{
  expect(url).toBe("/api/me/marketing-preferences");
  if(init?.method==="POST"){expect(JSON.parse(String(init.body))).toEqual({decision:"granted",policyVersion:"marketing-email-2026-11-v1",explicitOptIn:true});status="consent_recorded_paused";}
  return Response.json({status});
 });vi.stubGlobal("fetch",fetcher);
 await act(async()=>{root.render(React.createElement(MarketingEmailPreferences,{}));});
 expect(host.querySelector("button")!.disabled).toBe(true);
 await act(async()=>{(host.querySelector("input") as HTMLInputElement).click();});await act(async()=>host.querySelector("button")!.click());
 expect(host.textContent).toContain("Promotional delivery remains paused");
});
it("does not offer fixture actions when Office authorization fails",async()=>{
 vi.stubGlobal("fetch",vi.fn(async()=>Response.json({error:"MFA required"},{status:403})));
 await act(async()=>root.render(React.createElement(MarketingEmailPreferences,{mode:"office"})));
 expect(host.textContent).toContain("Preferences are temporarily unavailable");expect([...host.querySelectorAll("button")].every(b=>b.disabled)).toBe(true);
});
