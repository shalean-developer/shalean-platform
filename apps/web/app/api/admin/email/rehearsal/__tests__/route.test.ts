import {afterEach,beforeEach,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({authorize:vi.fn(),customerAuth:vi.fn(),admin:vi.fn(),rpc:vi.fn()}));
vi.mock("@/lib/auth/requireAdminApi",()=>({requireAdminApi:m.authorize}));
vi.mock("@/lib/auth/customerBearer",()=>({requireCustomerSession:m.customerAuth}));
vi.mock("@/lib/supabase/admin",()=>({getSupabaseAdmin:m.admin}));
import {GET,POST} from "../route";
import {POST as customerPost} from "@/app/api/me/marketing-rehearsal/route";
const origin="https://pricing-test.shalean.co.za",id="6b891181-1822-44ee-b713-24b213db540a",email="marketing-acceptance-20261105@example.test";
const request=(body:object={action:"record_grant"},host=origin)=>new Request(host+"/api/admin/email/rehearsal",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
beforeEach(()=>{
 vi.clearAllMocks();vi.stubEnv("SHALEAN_APP_ENV","staging");vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL","https://uwvnmluiqbczeduzjgse.supabase.co");vi.stubEnv("OUTBOUND_MESSAGING_DISABLED","true");vi.stubEnv("RESEND_CONTACT_WRITES_DISABLED","true");
 m.authorize.mockResolvedValue({ok:true,userId:"owner-actor",email:"owner@example.test"});
 m.customerAuth.mockResolvedValue({ok:true,session:{userId:id,email}});
 m.rpc.mockResolvedValue({data:[{outcome:"retry_required"}],error:null});
 m.admin.mockReturnValue({rpc:m.rpc,from:vi.fn(()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:{role:"customer",billing_email:email,marketing_consent_generation:3},error:null})})})}))});
});
afterEach(()=>vi.unstubAllEnvs());
it.each([["SHALEAN_APP_ENV","production"],["NEXT_PUBLIC_SUPABASE_URL","https://paqjwfulwywtsyyvdxrq.supabase.co"],["OUTBOUND_MESSAGING_DISABLED","false"],["RESEND_CONTACT_WRITES_DISABLED","false"]])("rejects unsafe %s before auth/database access",async(name,value)=>{
 vi.stubEnv(name,value);expect((await POST(request())).status).toBe(404);expect((await GET(new Request(origin))).status).toBe(404);expect(m.authorize).not.toHaveBeenCalled();expect(m.admin).not.toHaveBeenCalled();
});
it("rejects a different site before evaluating Office authority",async()=>{
 expect((await POST(request(undefined,"https://shalean.co.za"))).status).toBe(404);expect(m.authorize).not.toHaveBeenCalled();
});
it.each([401,403,503])("propagates Office authentication/MFA/permission denial %s without fixture access",async status=>{
 m.authorize.mockResolvedValue({ok:false,status,error:"Office access denied"});expect((await POST(request())).status).toBe(status);expect(m.authorize).toHaveBeenCalledWith(expect.any(Request),["system.settings"]);expect(m.admin).not.toHaveBeenCalled();expect(m.rpc).not.toHaveBeenCalled();
});
it.each([["record_grant","granted",true],["record_withdrawal","withdrawn",false]])("%s mutates only the pinned fixture, never the Office actor",async(action,decision,explicit)=>{
 expect((await POST(request({action}))).status).toBe(200);
 expect(m.rpc).toHaveBeenCalledWith("marketing_record_consent_decision_atomic",expect.objectContaining({p_customer_id:id,p_email:email,p_decision:decision,p_explicit_opt_in:explicit,p_evidence_reference:expect.stringMatching(/^staging-office:owner-actor:/)}));
 expect(m.customerAuth).not.toHaveBeenCalled();expect(JSON.stringify(m.rpc.mock.calls)).not.toContain("owner@example.test");
});
it("refuses caller-selected identities and consent arguments",async()=>{
 for(const body of [{action:"record_grant",customerId:"real"},{action:"record_withdrawal",email:"real@example.org"},{action:"record_grant",explicitOptIn:false}])expect((await POST(request(body))).status).toBe(400);
 expect(m.rpc).not.toHaveBeenCalled();
});
it("keeps Office-only actions unavailable through the customer endpoint",async()=>{
 expect((await customerPost(request({action:"record_grant"}))).status).toBe(400);expect(m.authorize).not.toHaveBeenCalled();expect(m.rpc).not.toHaveBeenCalled();
});
it("does not report success when the consent transaction fails",async()=>{
 m.rpc.mockResolvedValue({data:null,error:{message:"synthetic failure"}});expect((await POST(request())).status).toBe(409);
});
