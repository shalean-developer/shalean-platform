import {afterEach,beforeEach,expect,it,vi} from "vitest";
import {NextRequest,NextResponse} from "next/server";
import {policyForOfficePath} from "@/lib/admin/officeExperience";
const m=vi.hoisted(()=>({session:vi.fn()}));
vi.mock("@/lib/supabase/supabaseMiddleware",()=>({updateSession:m.session}));
import {proxy} from "@/proxy";
beforeEach(()=>{vi.clearAllMocks();vi.stubEnv("NODE_ENV","production");vi.stubEnv("SHALEAN_APP_ENV","staging");vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL","https://uwvnmluiqbczeduzjgse.supabase.co");vi.stubEnv("OUTBOUND_MESSAGING_DISABLED","true");vi.stubEnv("RESEND_CONTACT_WRITES_DISABLED","true");m.session.mockResolvedValue(NextResponse.next());});
afterEach(()=>vi.unstubAllEnvs());
const request=(path:string,host="pricing-test.shalean.co.za")=>new NextRequest("https://"+host+path,{headers:{host}});
it("routes the handed-off URL to Office before customer login/dashboard routing",async()=>{
 const response=await proxy(request("/account/email-test?untrusted=ignored"));expect(response.status).toBe(307);expect(response.headers.get("location")).toBe("https://pricing-test.shalean.co.za/office/marketing/email/test");expect(response.headers.get("x-robots-tag")).toContain("noindex");expect(m.session).not.toHaveBeenCalled();
});
it("the Office destination still passes through normal session/MFA routing",async()=>{
 const response=await proxy(request("/office/marketing/email/test"));expect(response.status).toBe(200);expect(m.session).toHaveBeenCalledOnce();
});
it("does not redirect the separate synthetic customer entry point",async()=>{
 expect((await proxy(request("/account/email-rehearsal"))).status).toBe(200);expect(m.session).toHaveBeenCalledOnce();
});
it("does not activate the handoff alias on production",async()=>{
 vi.stubEnv("SHALEAN_APP_ENV","production");await proxy(request("/account/email-test","shalean.co.za"));expect(m.session).toHaveBeenCalledOnce();
});
it("requires an explicit Owner policy rather than the broader marketing page policy",()=>{
 expect(policyForOfficePath("/office/marketing/email/test")).toMatchObject({anyOf:["system.settings"],audience:["owner"]});expect(policyForOfficePath("/office/marketing/email")).toMatchObject({anyOf:["marketing.view","content.draft","content.publish"]});
});
