import {createHmac} from "node:crypto";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({insert:vi.fn(),lookup:vi.fn(),update:vi.fn()}));
vi.mock("@supabase/supabase-js",()=>({createClient:()=>({from:(table:string)=>{
 if(table==="email_delivery_events")return {insert:m.insert};
 if(table==="email_outbound_messages")return {select:()=>({eq:()=>({eq:()=>({maybeSingle:m.lookup})})}),update:(...args:unknown[])=>{m.update(...args);const query={eq:()=>query,not:()=>query,then:(resolve:(v:unknown)=>void)=>resolve({error:null})};return query;}};
 throw Error("Unapproved write: "+table);
}})}));
import {POST} from "../route";
const key=Buffer.from("synthetic-staging-secret-minimum-32-bytes"),secret="whsec_"+key.toString("base64"),email="first@example.test",base="https://pricing-test.shalean.co.za/api/webhooks/resend/staging";
const event=(to=[email],id="stage-message",type="email.delivered")=>({type,data:{email_id:id,to,tags:{shalean_environment:"staging"}}});
function signed(value=event(),signingKey=key){const body=JSON.stringify(value),id="test-stage-event",timestamp=String(Math.floor(Date.now()/1000));return new Request(base,{method:"POST",body,headers:{"svix-id":id,"svix-timestamp":timestamp,"svix-signature":"v1,"+createHmac("sha256",signingKey).update(`${id}.${timestamp}.${body}`).digest("base64")}});}
beforeEach(()=>{vi.clearAllMocks();vi.stubEnv("SHALEAN_APP_ENV","staging");vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL","https://uwvnmluiqbczeduzjgse.supabase.co");vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY","synthetic-private-key");vi.stubEnv("RESEND_API_KEY","re_synthetic_test");vi.stubEnv("RESEND_STAGING_WEBHOOK_SECRET",secret);vi.stubEnv("RESEND_WEBHOOK_SECRET","different-production-secret");vi.stubEnv("MARKETING_ACCEPTANCE_EMAIL_ALLOWLIST",email+",second@example.test");m.insert.mockResolvedValue({error:null});m.lookup.mockResolvedValue({data:{id:"local-stage-row"},error:null});vi.stubGlobal("fetch",vi.fn(()=>{throw Error("Must not call provider");}));});
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});
it("requires the separate staging signing secret",async()=>{expect((await POST(signed(event(),Buffer.from("wrong-key")))).status).toBe(400);expect(m.insert).not.toHaveBeenCalled();expect(m.lookup).not.toHaveBeenCalled();});
it("uses real signature verification and local message correlation before recording delivery",async()=>{expect((await POST(signed())).status).toBe(200);expect(m.lookup).toHaveBeenCalledOnce();expect(m.insert).toHaveBeenCalledOnce();expect(m.update).toHaveBeenCalledWith(expect.objectContaining({delivery_status:"delivered"}));expect(fetch).not.toHaveBeenCalled();});
it.each([[["production@example.test"]],[[email,"production@example.test"]]])("ignores shared-account events for unrelated/multiple recipients",async(to)=>{expect(await (await POST(signed(event(to)))).json()).toMatchObject({ignored:true});expect(m.lookup).not.toHaveBeenCalled();expect(m.insert).not.toHaveBeenCalled();});
it("retries a marked staging delivery that races ahead of ledger persistence",async()=>{m.lookup.mockResolvedValue({data:null,error:null});expect((await POST(signed())).status).toBe(503);expect(m.insert).not.toHaveBeenCalled();});
it("ignores an allowed inbox's unmarked production email before lookup",async()=>{const production=event();production.data.tags.shalean_environment="production";expect(await (await POST(signed(production))).json()).toMatchObject({ignored:true});expect(m.lookup).not.toHaveBeenCalled();expect(m.insert).not.toHaveBeenCalled();});
it("never processes shared provider contact changes",async()=>{expect(await (await POST(signed(event([email],"stage-message","contact.updated")))).json()).toMatchObject({ignored:true});expect(m.lookup).not.toHaveBeenCalled();expect(m.insert).not.toHaveBeenCalled();});
it("fails retryably when local correlation lookup is unavailable",async()=>{m.lookup.mockResolvedValue({data:null,error:{message:"unavailable"}});expect((await POST(signed())).status).toBe(503);expect(m.insert).not.toHaveBeenCalled();});
it("rejects production deployment and oversized streamed payloads before writes",async()=>{
 vi.stubEnv("SHALEAN_APP_ENV","production");
 expect((await POST(signed())).status).toBe(404);
 vi.stubEnv("SHALEAN_APP_ENV","staging");
 const oversized = await POST(new Request(base,{method:"POST",body:"x".repeat(32769)}));
 expect(oversized.status).toBe(413);
 expect(m.insert).not.toHaveBeenCalled();
});
