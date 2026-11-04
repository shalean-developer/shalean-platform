import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(()=>({verify:vi.fn(),getClient:vi.fn(),apply:vi.fn()}));
vi.mock("resend",()=>({Resend:class {webhooks={verify:mocks.verify};}}));
vi.mock("@supabase/supabase-js",()=>({createClient:mocks.getClient}));
vi.mock("@/lib/email/providerPreferenceWebhook",()=>({applyProviderPreferenceWithdrawal:mocks.apply}));
import { POST } from "../route";
type Event = {type:string;created_at?:string;data?:Record<string,unknown>};
const url="https://shalean.co.za/api/webhooks/resend";
function signedRequest(headers=true) {
  return new Request(url,{method:"POST",body:JSON.stringify({synthetic:true}),headers:headers?
    {"svix-id":"synthetic-svix-1","svix-timestamp":"synthetic-now","svix-signature":"synthetic-signature"}:{}});
}
function fakeAdmin(opts:{duplicate?:boolean;eventFail?:boolean;suppressionFail?:boolean}={}){
  const writes:{table:string;kind:string;payload:Record<string,unknown>}[]=[];
  const admin={from(table:string){
    return {
      insert:async(row:Record<string,unknown>)=>{
        writes.push({table,kind:"insert",payload:row});
        return {error:opts.eventFail?{code:"P0001"}:opts.duplicate?{code:"23505"}:null};
      },
      update:(row:Record<string,unknown>)=>({
        eq:async()=>{writes.push({table,kind:"update",payload:row});return {error:null};},
      }),
      upsert:async(row:Record<string,unknown>)=>{
        writes.push({table,kind:"upsert",payload:row});
        return {error:opts.suppressionFail?{code:"P0001"}:null};
      },
    };
  }};
  return {admin,writes};
}
describe("Gate 3 signed Resend webhook integration — synthetic, no provider network",()=>{
  beforeEach(()=>{
    vi.clearAllMocks();
    vi.stubEnv("RESEND_WEBHOOK_SECRET","synthetic-signing-key");
    vi.stubEnv("RESEND_API_KEY","synthetic-api-key");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL","https://synthetic.local");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY","synthetic-role-key");
    const db=fakeAdmin();
    mocks.getClient.mockReturnValue(db.admin);
    mocks.apply.mockResolvedValue({ok:true});
    mocks.verify.mockReturnValue({type:"email.delivered",data:{
      email_id:"synthetic-provider-id",to:["synthetic@example.test"],subject:"Synthetic booking",
    }});
  });
  afterEach(()=>vi.unstubAllEnvs());
  it("missing signature headers reject before durable event insert",async()=>{
    const response=await POST(signedRequest(false));
    expect(response.status).toBe(400);
    expect(mocks.verify).not.toHaveBeenCalled();
  });
  it("invalid signature does not insert or update delivery state",async()=>{
    mocks.verify.mockImplementation(()=>{throw Error("synthetic invalid signature");});
    const response=await POST(signedRequest());
    expect(response.status).toBe(400);
    expect(mocks.apply).not.toHaveBeenCalled();
  });
  it("verified delivered event records event before delivery state update",async()=>{
    const db=fakeAdmin();mocks.getClient.mockReturnValue(db.admin);
    const response=await POST(signedRequest());
    expect(response.status).toBe(200);
    expect(db.writes[0]).toMatchObject({table:"email_delivery_events",kind:"insert"});
    expect(db.writes[1]).toMatchObject({table:"email_outbound_messages",kind:"update",payload:{
      delivery_status:"delivered",retry_status:"recovered",
    }});
  });
  it("duplicate event is acknowledged without replaying email status update",async()=>{
    const db=fakeAdmin({duplicate:true});mocks.getClient.mockReturnValue(db.admin);
    const response=await POST(signedRequest());
    expect(await response.json()).toMatchObject({ok:true,duplicate:true});
    expect(db.writes.filter(x=>x.table==="email_outbound_messages")).toHaveLength(0);
  });
  it("signed contact withdrawal updates CRM via provider preference handler",async()=>{
    mocks.verify.mockReturnValue({type:"contact.updated",data:{email:"synthetic@example.test",unsubscribed:true}});
    const response=await POST(signedRequest());
    expect(response.status).toBe(200);
    expect(mocks.apply).toHaveBeenCalledWith(expect.anything(),{
      type:"contact.updated",email:"synthetic@example.test",unsubscribed:true,svixId:"synthetic-svix-1",
    });
  });
  it("partial preference update failure returns retryable 500 rather than acknowledgement",async()=>{
    mocks.verify.mockReturnValue({type:"contact.updated",data:{email:"synthetic@example.test",unsubscribed:true}});
    mocks.apply.mockResolvedValue({ok:false,reason:"profile_update_failed"});
    const response=await POST(signedRequest());
    expect(response.status).toBe(500);
  });
  it("hard bounce records suppression and blocks retries",async()=>{
    const db=fakeAdmin();mocks.getClient.mockReturnValue(db.admin);
    mocks.verify.mockReturnValue({type:"email.bounced",created_at:"2026-11-04T00:00:00Z",
      data:{email_id:"synthetic-provider-id",to:["synthetic@example.test"]}});
    const response=await POST(signedRequest());
    expect(response.status).toBe(200);
    expect(db.writes.find(x=>x.table==="email_suppressions")).toMatchObject({
      kind:"upsert",payload:{email:"synthetic@example.test",reason:"bounced"},
    });
  });
  it("failure to persist suppression returns 500",async()=>{
    const db=fakeAdmin({suppressionFail:true});mocks.getClient.mockReturnValue(db.admin);
    mocks.verify.mockReturnValue({type:"email.suppressed",data:{email_id:"synthetic-id",to:["synthetic@example.test"]}});
    const response=await POST(signedRequest());
    expect(response.status).toBe(500);
  });
});
