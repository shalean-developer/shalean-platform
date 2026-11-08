import {afterEach,beforeEach,expect,it,vi} from "vitest";
import {marketingAcceptanceRecipients,marketingAcceptanceHost} from "../marketingAcceptanceConfig";
import {GET} from "@/app/api/admin/email/acceptance/route";
const m=vi.hoisted(()=>({auth:vi.fn(),admin:vi.fn(),from:vi.fn(),identity:vi.fn()}));
vi.mock("@/lib/auth/requireAdminApi",()=>({requireAdminApi:m.auth}));
vi.mock("@/lib/supabase/admin",()=>({getSupabaseAdmin:m.admin}));
const base="https://pricing-test.shalean.co.za",first="first@example.test",second="second@example.test";
beforeEach(()=>{vi.clearAllMocks();vi.stubEnv("SHALEAN_APP_ENV","staging");vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL","https://uwvnmluiqbczeduzjgse.supabase.co");vi.stubEnv("MARKETING_ACCEPTANCE_EMAIL_ALLOWLIST",first+","+second);m.auth.mockResolvedValue({ok:true,userId:"owner"});m.admin.mockReturnValue({from:m.from,auth:{admin:{getUserById:m.identity}}});m.from.mockReturnValue({select:()=>({eq:()=>({maybeSingle:async()=>({data:null,error:null})})})});});
afterEach(()=>vi.unstubAllEnvs());
it.each([["SHALEAN_APP_ENV","production"],["NEXT_PUBLIC_SUPABASE_URL","https://paqjwfulwywtsyyvdxrq.supabase.co"],["MARKETING_ACCEPTANCE_EMAIL_ALLOWLIST",first],["MARKETING_ACCEPTANCE_EMAIL_ALLOWLIST",first+","+first],["MARKETING_ACCEPTANCE_EMAIL_ALLOWLIST",first+","+second+",third@example.test"]])("rejects unsafe configuration %s",async(key,value)=>{vi.stubEnv(key,value);expect(marketingAcceptanceRecipients()).toEqual([]);expect((await GET(new Request(base))).status).toBe(404);expect(m.auth).not.toHaveBeenCalled();expect(m.admin).not.toHaveBeenCalled();});
it("checks URL and Host and never accepts a production origin",()=>{expect(marketingAcceptanceHost(new Request(base))).toBe(true);expect(marketingAcceptanceHost(new Request(base,{headers:{host:"shalean.co.za"}}))).toBe(false);expect(marketingAcceptanceHost(new Request("https://shalean.co.za"))).toBe(false);});
it.each([401,403,503])("preserves MFA/Owner denial %s before recipient access",async(status)=>{m.auth.mockResolvedValue({ok:false,status,error:"denied"});expect((await GET(new Request(base))).status).toBe(status);expect(m.auth).toHaveBeenCalledWith(expect.any(Request),["system.settings"]);expect(m.admin).not.toHaveBeenCalled();});
it("reports missing customer accounts without creating accounts or sending messages",async()=>{const r=await GET(new Request(base));expect(await r.json()).toMatchObject({recipients:[{email:first,status:"account_required"},{email:second,status:"account_required"}],sendingEnabled:false,providerWritesEnabled:false});expect(r.headers.get("cache-control")).toBe("no-store");expect(m.identity).not.toHaveBeenCalled();});
it("rejects unavailable identity lookup instead of claiming verified consent",async()=>{m.from.mockReturnValue({select:()=>({eq:()=>({maybeSingle:async()=>({data:{id:"known",role:"customer"},error:null})})})});m.identity.mockResolvedValue({data:{user:null},error:{message:"unavailable"}});expect((await GET(new Request(base))).status).toBe(503);});
it("does not expose owner accounts as customer-ready",async()=>{m.from.mockReturnValue({select:()=>({eq:()=>({maybeSingle:async()=>({data:{role:"admin"},error:null})})})});const r=await GET(new Request(base));expect((await r.json()).recipients.every((r:{status:string})=>r.status==="customer_account_required")).toBe(true);expect(m.identity).not.toHaveBeenCalled();});

it.each([
 [null,null,"consent_required"], ["withdrawn","2026-11-08T00:00:00Z","consent_required"],
 ["granted",null,"consent_recorded"], ["granted","2026-11-08T00:00:00Z","delivery_paused"],
])("reports persisted customer status for decision %s",async(decision,optedOut,status)=>{
 m.from.mockImplementation((table:string)=>{
  let selectedEmail=first;
  const query={select:()=>query,eq:(key:string,value:string)=>{if(key==="billing_email")selectedEmail=value;return query;},order:()=>query,limit:()=>query,
   maybeSingle:async()=>({error:null,data:table==="user_profiles"?{id:selectedEmail,role:"customer",marketing_emails_unsubscribed_at:optedOut}:{decision}})};
  return query;
 });
 m.identity.mockImplementation(async(id:string)=>({data:{user:{email:id,email_confirmed_at:"2026-11-08"}},error:null}));
 const result=await GET(new Request(base));expect(result.status).toBe(200);expect((await result.json()).recipients.every((r:{status:string})=>r.status===status)).toBe(true);
});

it("accepts the canonical external Host when Plesk uses an internal HTTP request URL",()=>{
 expect(marketingAcceptanceHost(new Request("http://127.0.0.1:3000/api/admin/email/acceptance",{headers:{host:"pricing-test.shalean.co.za"}}))).toBe(true);
 expect(marketingAcceptanceHost(new Request("http://127.0.0.1:3000/api/admin/email/acceptance",{headers:{host:"other.example.test","x-forwarded-host":"pricing-test.shalean.co.za"}}))).toBe(false);
});
