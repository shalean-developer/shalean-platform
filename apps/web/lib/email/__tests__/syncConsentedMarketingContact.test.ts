import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { syncConsentedMarketingContact } from "../syncConsentedMarketingContact";

const segmentId="00000000-0000-4000-8000-000000000999";
const contactId="00000000-0000-4000-8000-000000000888";
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
function provider(opts:{suppression?:number;contact?:number;unsubscribed?:boolean;inSegment?:boolean;segmentLookup?:number;segmentWrite?:number}={}){
  const calls:{url:string,method:string,body?:string}[]=[];
  const fetchFn=vi.fn(async(url:string|URL|Request,init?:RequestInit)=>{
    const path=String(url);
    const method=init?.method??"GET";
    calls.push({url:path,method,body:String(init?.body??"")});
    if(path.includes("/suppressions/"))return response(opts.suppression??404);
    if(path.endsWith("/contacts") && method==="POST")return response(201,{id:contactId});
    if(path.endsWith("/segments") && method==="GET")return response(opts.segmentLookup??200,{
      object:"list",data:opts.inSegment?[{id:segmentId}]:[],has_more:false,
    });
    if(path.includes("/segments/") && method==="POST")return response(opts.segmentWrite??200,{id:segmentId});
    return response(opts.contact??404,opts.contact===200?{id:contactId,unsubscribed:opts.unsubscribed??false}:undefined);
  }) as unknown as typeof fetch;
  return {calls,fetchFn};
}
const args={customerId:"00000000-0000-4000-8000-000000000777",email:"synthetic@example.test",apiKey:"synthetic-api-key",segmentId};
describe("Gate 3 consent-only Resend contact + segment contract — no live provider",()=>{
  it("new affirmative opt-in creates contact then separately adds it to configured segment",async()=>{
    const p=provider();
    expect(await syncConsentedMarketingContact(fakeDb(),{...args,fetchFn:p.fetchFn})).toBe("created");
    expect(p.calls.map(x=>x.method)).toEqual(["GET","GET","POST","GET","POST"]);
    expect(JSON.parse(p.calls[2]!.body!)).toEqual({email:args.email,unsubscribed:false});
    expect(p.calls[4]?.url).toContain("/contacts/"+contactId+"/segments/"+segmentId);
  });
  it("existing subscribed contact missing the segment is enrolled without duplicate contact creation",async()=>{
    const p=provider({contact:200});
    expect(await syncConsentedMarketingContact(fakeDb(),{...args,fetchFn:p.fetchFn})).toBe("already_subscribed");
    expect(p.calls.filter(x=>x.method==="POST")).toHaveLength(1);
    expect(p.calls.filter(x=>x.method==="POST")[0]?.url).toContain("/segments/"+segmentId);
  });
  it("already-segmented contact needs no writes",async()=>{
    const p=provider({contact:200,inSegment:true});
    expect(await syncConsentedMarketingContact(fakeDb(),{...args,fetchFn:p.fetchFn})).toBe("already_subscribed");
    expect(p.calls.every(x=>x.method==="GET")).toBe(true);
  });
  it("withdrawn consent makes zero provider requests",async()=>{
    const p=provider();
    expect(await syncConsentedMarketingContact(fakeDb({decision:"withdrawn"}),{...args,fetchFn:p.fetchFn})).toBe("blocked");
    expect(p.calls).toHaveLength(0);
  });
  it("existing CRM opt-out and local suppression make zero provider requests",async()=>{
    for(const db of [fakeDb({optedOut:true}),fakeDb({suppressed:true})]){
      const p=provider();
      expect(await syncConsentedMarketingContact(db,{...args,fetchFn:p.fetchFn})).toBe("blocked");
      expect(p.calls).toHaveLength(0);
    }
  });
  it("provider suppression and existing opt-out never re-subscribe",async()=>{
    const a=provider({suppression:200});
    expect(await syncConsentedMarketingContact(fakeDb(),{...args,fetchFn:a.fetchFn})).toBe("blocked");
    const b=provider({contact:200,unsubscribed:true});
    expect(await syncConsentedMarketingContact(fakeDb(),{...args,fetchFn:b.fetchFn})).toBe("blocked");
    expect([...a.calls,...b.calls].every(x=>x.method==="GET")).toBe(true);
  });
  it("failed provider suppression lookup denies before contact creation",async()=>{
    const p=provider({suppression:503});
    expect(await syncConsentedMarketingContact(fakeDb(),{...args,fetchFn:p.fetchFn})).toBe("retry_required");
    expect(p.calls).toHaveLength(1);
  });
  it("segment membership lookup error or segment write failure does not report success",async()=>{
    for(const opts of [{contact:200,segmentLookup:503},{contact:200,segmentWrite:429}]){
      const p=provider(opts);
      expect(await syncConsentedMarketingContact(fakeDb(),{...args,fetchFn:p.fetchFn})).toBe("retry_required");
    }
  });
  it("missing configured segment fails closed with no provider requests",async()=>{
    const p=provider();
    expect(await syncConsentedMarketingContact(fakeDb(),{...args,segmentId:"",fetchFn:p.fetchFn})).toBe("retry_required");
    expect(p.calls).toHaveLength(0);
  });
  it("consent lookup failure never contacts provider",async()=>{
    const p=provider();
    expect(await syncConsentedMarketingContact(fakeDb({failed:true}),{...args,fetchFn:p.fetchFn})).toBe("retry_required");
    expect(p.calls).toHaveLength(0);
  });
});
