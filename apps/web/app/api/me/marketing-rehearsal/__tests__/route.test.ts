import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { verifyMarketingUnsubscribeToken } from "@/lib/email/marketingUnsubscribeToken";
const m = vi.hoisted(() => ({ auth: vi.fn(), admin: vi.fn() }));
vi.mock("@/lib/auth/customerBearer", () => ({ requireCustomerSession: m.auth }));
vi.mock("@/lib/supabase/admin", () => ({ getSupabaseAdmin: m.admin }));
import { GET, POST } from "../route";
const id = "6b891181-1822-44ee-b713-24b213db540a", email = "marketing-acceptance-20261105@example.test";
const origin = "https://pricing-test.shalean.co.za";
const secret = "synthetic-staging-signing-secret-of-32-characters";
const request = (body: object = { action: "issue_links" }, host = origin) => new Request(host + "/api/me/marketing-rehearsal", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
function profile(role = "customer", billing_email = email) {
  const update = vi.fn(() => { throw Error("Link issuance cannot mutate records"); });
  const client = { from: vi.fn(() => ({ update, select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { role, billing_email, marketing_consent_generation: 3 }, error: null }) }) }) })) };
  m.admin.mockReturnValue(client); return { client, update };
}
beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv("SHALEAN_APP_ENV", "staging"); vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://uwvnmluiqbczeduzjgse.supabase.co");
  vi.stubEnv("OUTBOUND_MESSAGING_DISABLED", "true"); vi.stubEnv("RESEND_CONTACT_WRITES_DISABLED", "true"); vi.stubEnv("MARKETING_UNSUBSCRIBE_SECRET", secret);
  m.auth.mockResolvedValue({ ok: true, session: { userId: id, email } }); profile();
});
afterEach(() => vi.unstubAllEnvs());
it.each([
  ["SHALEAN_APP_ENV", "production"], ["SHALEAN_APP_ENV", "development"],
  ["NEXT_PUBLIC_SUPABASE_URL", "https://paqjwfulwywtsyyvdxrq.supabase.co"],
  ["OUTBOUND_MESSAGING_DISABLED", "false"], ["RESEND_CONTACT_WRITES_DISABLED", "false"],
])("fails closed before authentication/database access when %s=%s", async (name, value) => {
  vi.stubEnv(name, value);
  expect((await POST(request())).status).toBe(404); expect((await GET(new Request(origin))).status).toBe(404);
  expect(m.admin).not.toHaveBeenCalled(); expect(m.auth).not.toHaveBeenCalled();
});
it("rejects the wrong request origin even in staging", async () => {
  expect((await POST(request(undefined, "https://shalean.co.za"))).status).toBe(404); expect(m.admin).not.toHaveBeenCalled();
});
it.each([{ userId: "other", email }, { userId: id, email: "real-customer@example.org" }])("requires the exact verified synthetic identity", async session => {
  m.auth.mockResolvedValue({ ok: true, session }); expect((await POST(request())).status).toBe(403); expect(m.admin).not.toHaveBeenCalled();
});
it("validates database ownership before issuing a signed link", async () => {
  profile("admin"); expect((await POST(request())).status).toBe(503);
  profile("customer", "other@example.test"); expect((await POST(request())).status).toBe(503);
});
it("issues only synthetic current/unused/legacy links and makes no writes", async () => {
  const f = profile(); const response = await POST(request()); const body = await response.json();
  expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("no-store");
  expect(m.auth).toHaveBeenCalledWith(expect.any(Request), { requireVerifiedEmail: true });
  for (const [key, version] of [["url", 2], ["unusedUrl", 2], ["legacyUrl", 1]] as const) {
    const url = new URL(body[key]); expect(url.origin).toBe(origin);
    expect(verifyMarketingUnsubscribeToken(url.searchParams.get("token")!, secret)).toMatchObject({ customerId: id, version });
  }
  expect(body.url).not.toBe(body.unusedUrl); expect(f.update).not.toHaveBeenCalled(); expect(JSON.stringify(body)).not.toContain(secret);
});
it("does not accept caller-selected customer identities or operations", async () => {
  expect((await POST(request({ action: "issue_links", customerId: "other" }))).status).toBe(400);
  expect((await POST(request({ action: "clear_real_customers" }))).status).toBe(400);
});
it("missing signing configuration never produces usable links", async () => {
  vi.stubEnv("MARKETING_UNSUBSCRIBE_SECRET", ""); expect((await POST(request())).status).toBe(503);
});
it("never replaces a worker-owned processing claim", async () => {
  const update=vi.fn();
  m.admin.mockReturnValue({from:(table:string)=>{
    const builder:any={select:()=>builder,eq:()=>builder,maybeSingle:async()=>({data:table==="user_profiles"?{role:"customer",billing_email:email,marketing_consent_generation:3}:{id:"job",status:"processing",last_error:null,claim_token:"worker-owned"},error:null}),update};
    return builder;
  }});
  expect((await POST(request({action:"prepare_replay",state:"pending"}))).status).toBe(409);
  expect(update).not.toHaveBeenCalled();
});
it("uses status and prior claim compare-and-swap and rejects a lost race", async()=>{
  const filters:Array<[string,unknown]>=[]; const writes:unknown[]=[];
  m.admin.mockReturnValue({from:(table:string)=>{
    let writing=false;
    const builder:any={select:()=>builder,eq:(key:string,value:unknown)=>{if(writing)filters.push([key,value]);return builder},is:(key:string,value:unknown)=>{filters.push([key,value]);return builder},
      update:(value:unknown)=>{writing=true;writes.push(value);return builder},
      maybeSingle:async()=>({data:writing?null:table==="user_profiles"?{role:"customer",billing_email:email,marketing_consent_generation:3}:{id:"job",status:"processing",last_error:"staging_fixture_replay",claim_token:"old-fixture-claim"},error:null})};
    return builder;
  }});
  expect((await POST(request({action:"prepare_replay",state:"pending"}))).status).toBe(409);
  expect(writes).toHaveLength(1);
  expect(filters).toEqual(expect.arrayContaining([["id","job"],["status","processing"],["claim_token","old-fixture-claim"]]));
});
