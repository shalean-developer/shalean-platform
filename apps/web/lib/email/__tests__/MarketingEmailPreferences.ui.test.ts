// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const mocks=vi.hoisted(()=>({getSession:vi.fn(),user:vi.fn()}));
vi.mock("@/hooks/useUser",()=>({useUser:mocks.user}));
vi.mock("@/lib/supabaseClient",()=>({
  getSupabaseClient:()=>({auth:{getSession:mocks.getSession}}),
}));
import { MarketingEmailPreferences } from "@/components/account/MarketingEmailPreferences";

let host:HTMLDivElement;
let root:Root;
let fetchMock:ReturnType<typeof vi.fn>;
function button(label:string):HTMLButtonElement {
  const result=[...host.querySelectorAll("button")].find(el=>el.textContent?.trim()===label);
  if(!result)throw Error("button missing: "+label);
  return result as HTMLButtonElement;
}
describe("Gate 3 customer preference UI — isolated synthetic DOM",()=>{
  beforeEach(async()=>{
    vi.clearAllMocks();
    // React 19 tests need an explicit act environment in jsdom.
    Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
    mocks.user.mockReturnValue({user:{id:"synthetic-user"},loading:false});
    mocks.getSession.mockResolvedValue({data:{session:{access_token:"synthetic-token"}},error:null});
    let persistedStatus = "no_consent";
    fetchMock=vi.fn(async(_url:string,init?:RequestInit)=>{
      if(init?.method === "POST") persistedStatus = JSON.parse(String(init.body)).decision === "granted" ? "consent_recorded" : "unsubscribed";
      return {ok:true,json:async()=>init?.method === "POST" ? {ok:true} : {status:persistedStatus}};
    });
    vi.stubGlobal("fetch",fetchMock);
    host=document.createElement("div");document.body.appendChild(host);
    root=createRoot(host);
    await act(async()=>{root.render(React.createElement(MarketingEmailPreferences));});
  });
  afterEach(async()=>{
    await act(async()=>{root.unmount();});
    host.remove();
    vi.unstubAllGlobals();
  });
  it("initial checkbox is unchecked and cannot silently subscribe",()=>{
    const checkbox=host.querySelector('input[type="checkbox"]') as HTMLInputElement;
    expect(checkbox.checked).toBe(false);
    expect(button("Subscribe").disabled).toBe(true);
    expect(host.textContent).toContain("You have not subscribed");
    expect(fetchMock.mock.calls.every((args)=>args[1]?.method!=="POST")).toBe(true);
  });
  it("a deliberate checked opt-in sends authenticated policy evidence",async()=>{
    const checkbox=host.querySelector('input[type="checkbox"]') as HTMLInputElement;
    await act(async()=>{checkbox.click();});
    expect(button("Subscribe").disabled).toBe(false);
    await act(async()=>{button("Subscribe").click();});
    const post=fetchMock.mock.calls.find(args=>args[1]?.method==="POST");
    expect(post?.[1]?.headers?.Authorization).toBe("Bearer synthetic-token");
    expect(JSON.parse(post?.[1]?.body)).toMatchObject({
      decision:"granted",explicitOptIn:true,policyVersion:"marketing-email-2026-11-v1",
    });
    expect(host.textContent).toContain("Marketing consent recorded");
  });
  it("unsubscribe does not require a checked marketing opt-in",async()=>{
    await act(async()=>{button("Unsubscribe").click();});
    const post=fetchMock.mock.calls.find(args=>args[1]?.method==="POST");
    expect(JSON.parse(post?.[1]?.body)).toMatchObject({decision:"withdrawn",explicitOptIn:false});
    expect(host.textContent).toContain("Unsubscribed from marketing emails");
  });
  it("allows a previously unsubscribed customer to explicitly record fresh consent",async()=>{
    await act(async()=>{root.unmount();});
    root=createRoot(host);
    fetchMock.mockImplementation(async(_url:string,init?:RequestInit)=>({
      ok:true,json:async()=>init?.method==="POST"?{ok:true}:{status:"unsubscribed"},
    }));
    await act(async()=>{root.render(React.createElement(MarketingEmailPreferences));});
    expect(button("Subscribe").disabled).toBe(true);
    const checkbox=host.querySelector('input[type="checkbox"]') as HTMLInputElement;
    await act(async()=>{checkbox.click();});
    expect(button("Subscribe").disabled).toBe(false);
    await act(async()=>{button("Subscribe").click();});
    const post=fetchMock.mock.calls.find(args=>args[1]?.method==="POST");
    expect(JSON.parse(post?.[1]?.body)).toMatchObject({decision:"granted",explicitOptIn:true});
    expect(host.textContent).toContain("Promotional emails remain subject to delivery preferences and safety checks.");
  });
  it("distinguishes a fresh consent record from paused promotional delivery after reload",async()=>{
    await act(async()=>{root.unmount();}); root=createRoot(host);
    fetchMock.mockResolvedValueOnce({ok:true,json:async()=>({status:"consent_recorded_paused"})});
    await act(async()=>{root.render(React.createElement(MarketingEmailPreferences));});
    expect(host.textContent).toContain("Promotional delivery remains paused");
    const checkbox=host.querySelector('input[type="checkbox"]') as HTMLInputElement;
    expect(checkbox.checked).toBe(false);
    expect(button("Subscribe").disabled).toBe(true);
  });
  it("unavailable preference lookup does not offer opt-in",async()=>{
    await act(async()=>{root.unmount();});
    root=createRoot(host);
    fetchMock.mockRejectedValueOnce(new Error("synthetic database unavailable"));
    await act(async()=>{root.render(React.createElement(MarketingEmailPreferences));});
    expect(host.textContent).toContain("Preferences are temporarily unavailable");
    expect(button("Subscribe").disabled).toBe(true);
  });
});

describe("staging journey evidence labels",()=>{
  it("keeps each completed check's own label across batched React updates",async()=>{
    Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
    mocks.getSession.mockResolvedValue({data:{session:{access_token:"synthetic-token"}},error:null});
    const snapshot={generation:1,evidenceCount:5,decision:"withdrawn",unsubscribedAt:"2026-11-06T00:00:00Z",reconciliation:[],enrollment:[]};
    const base=window.location.origin;
    vi.stubGlobal("fetch",vi.fn(async(input:string|URL,init?:RequestInit)=>{
      const url=new URL(String(input),base);
      if(url.pathname==="/api/marketing/unsubscribe"){
        if(init?.method==="GET")return new Response(url.searchParams.get("token")==="legacy"?"<p>Sign in</p>":"Unsubscribe from marketing emails");
        return new Response("{}",{status:url.searchParams.get("token")==="legacy"?409:503});
      }
      const action=init?.body?JSON.parse(String(init.body)).action:null;
      return Response.json(action==="issue_links"?{url:base+"/api/marketing/unsubscribe?token=current",unusedUrl:base+"/api/marketing/unsubscribe?token=unused",legacyUrl:base+"/api/marketing/unsubscribe?token=legacy"}:init?.method==="POST"?{ok:true}:snapshot);
    }));
    const {MarketingEmailStagingJourney}=await import("@/components/account/MarketingEmailStagingJourney");
    const container=document.createElement("div");document.body.appendChild(container);const view=createRoot(container);
    try{
      await act(async()=>{view.render(React.createElement(MarketingEmailStagingJourney));});
      await act(async()=>{(container.querySelector('input[type="checkbox"]') as HTMLInputElement).click();});
      await act(async()=>{container.querySelector("button")!.click();});
      const labels=[...container.querySelectorAll("ol li")].map(el=>el.textContent);
      expect(labels).toEqual([
        "PASSOpening the signed confirmation does not change consent",
        "PASSAn older v1 link requires account confirmation and cannot withdraw",
        "FAILThe current signed link records a withdrawal",
      ]);
      expect(container.querySelector('[role="alert"]')?.textContent).toContain("It is not marked passed");
    }finally{await act(async()=>view.unmount());container.remove();vi.unstubAllGlobals();}
  });
});
