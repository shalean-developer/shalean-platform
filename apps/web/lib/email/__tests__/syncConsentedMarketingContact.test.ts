import { describe,expect,it,vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { syncConsentedMarketingContact } from "../syncConsentedMarketingContact";

function fakeDb(opts:{decision?:string;optedOut?:boolean;suppressed?:boolean;failed?:boolean}={}):SupabaseClient {
  const rows:Record<string,unknown>={
    user_profiles:{data:{role:"customer",billing_email:"synthetic@example.test",
      marketing_emails_unsubscribed_at:opts.optedOut?"2026-11-04T00:00:00Z":null},error:null},
    marketing_email_consent_events:{data:{decision:opts.decision??"granted"},error:null},
    email_suppressions:{data:opts.suppressed?{email:"synthetic@example.test"}:null,error:null},
  };
  return {from(table:string){
    const chain:Record<string,unknown>={};
    for(const name of ["eq","order","limit"]) chain[name]=()=>chain;
    chain.maybeSingle=async()=>opts.failed?{data:null,error:{message:"synthetic lookup failure"}}:rows[table];
    return {select:()=>chain};
  }} as unknown as SupabaseClient;
}
const response=(status:number,body?:unknown)=>({ok:status>=200&&status<300,status,json:async()=>body}) as Response;
function provider(suppression=404,contact=404,contactBody:unknown=null){
  const calls:{url:string,method:string,body?:string}[]=[];
  const fetchFn=vi.fn(async(url:string|URL|Request,opts?:RequestInit)=>{
    const path=String(url);calls.push({url:path,method:opts?.method??"GET",body:String(opts?.body??"")});
    if(path.includes("/suppressions/"))return response(suppression);
    if(path.endsWith("/contacts"))return response(201,{id:"synthetic-id"});
    return response(contact,contactBody);
  }) as unknown as typeof fetch;
  return {calls,fetchFn};
}
const args={customerId:"00000000-0000-4000-8000-000000000777",email:"synthetic@example.test",apiKey:"synthetic-api-key"};
describe("Gate 3 consent-only audience enrollment — synthetic no-live provider",()=>{
  it("new affirmative opt-in creates a contact only after checking suppression",async()=>{
    const p=provider();
    expect(await syncConsentedMarketingContact(fakeDb(),{...args,fetchFn:p.fetchFn})).toBe("created");
    expect(p.calls.map(x=>x.method)).toEqual(["GET","GET","POST"]);
    expect(JSON.parse(p.calls[2]!.body!)).toMatchObject({email:args.email,unsubscribed:false});
  });
  it("withdrawn consent makes zero provider requests",async()=>{
    const p=provider();
    expect(await syncConsentedMarketingContact(fakeDb({decision:"withdrawn"}),{...args,fetchFn:p.fetchFn})).toBe("blocked");
    expect(p.calls).toHaveLength(0);
  });
  it("existing CRM unsubscribe makes zero provider requests",async()=>{
    const p=provider();
    expect(await syncConsentedMarketingContact(fakeDb({optedOut:true}),{...args,fetchFn:p.fetchFn})).toBe("blocked");
    expect(p.calls).toHaveLength(0);
  });
  it("local suppression makes zero provider requests",async()=>{
    const p=provider();
    expect(await syncConsentedMarketingContact(fakeDb({suppressed:true}),{...args,fetchFn:p.fetchFn})).toBe("blocked");
    expect(p.calls).toHaveLength(0);
  });
  it("provider suppression blocks creation",async()=>{
    const p=provider(200);
    expect(await syncConsentedMarketingContact(fakeDb(),{...args,fetchFn:p.fetchFn})).toBe("blocked");
    expect(p.calls.map(x=>x.method)).toEqual(["GET"]);
  });
  it("existing provider opt-out never gets re-subscribed",async()=>{
    const p=provider(404,200,{unsubscribed:true});
    expect(await syncConsentedMarketingContact(fakeDb(),{...args,fetchFn:p.fetchFn})).toBe("blocked");
    expect(p.calls.every(x=>x.method==="GET")).toBe(true);
  });
  it("existing subscribed contact does not create duplicates",async()=>{
    const p=provider(404,200,{unsubscribed:false});
    expect(await syncConsentedMarketingContact(fakeDb(),{...args,fetchFn:p.fetchFn})).toBe("already_subscribed");
    expect(p.calls.every(x=>x.method==="GET")).toBe(true);
  });
  it("provider 503 fails closed without creating a contact",async()=>{
    const p=provider(503);
    expect(await syncConsentedMarketingContact(fakeDb(),{...args,fetchFn:p.fetchFn})).toBe("retry_required");
    expect(p.calls).toHaveLength(1);
  });
  it("consent lookup failure never contacts provider",async()=>{
    const p=provider();
    expect(await syncConsentedMarketingContact(fakeDb({failed:true}),{...args,fetchFn:p.fetchFn})).toBe("retry_required");
    expect(p.calls).toHaveLength(0);
  });
});
