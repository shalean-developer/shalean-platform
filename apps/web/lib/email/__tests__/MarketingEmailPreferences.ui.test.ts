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
    fetchMock=vi.fn(async(_url:string,init?:RequestInit)=>({
      ok:true,
      json:async()=>init?.method==="POST"?{ok:true}:{status:"no_consent"},
    }));
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
  it("unavailable preference lookup does not offer opt-in",async()=>{
    await act(async()=>{root.unmount();});
    root=createRoot(host);
    fetchMock.mockRejectedValueOnce(new Error("synthetic database unavailable"));
    await act(async()=>{root.render(React.createElement(MarketingEmailPreferences));});
    expect(host.textContent).toContain("Preferences are temporarily unavailable");
    expect(button("Subscribe").disabled).toBe(true);
  });
});
