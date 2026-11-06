import { createHmac } from "node:crypto";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { createMarketingUnsubscribeToken } from "@/lib/email/marketingUnsubscribeToken";

const mocks = vi.hoisted(() => ({
  getAdmin: vi.fn(),
  record: vi.fn(),
}));
vi.mock("@/lib/supabase/admin", () => ({ getSupabaseAdmin: mocks.getAdmin }));
vi.mock("@/lib/email/marketingConsentService", () => ({ recordCustomerMarketingDecision: mocks.record }));
import { GET, POST } from "../route";

const uuid = "00000000-0000-4000-8000-000000000777";
const secret = "synthetic-secret-of-at-least-32-characters";
const baseUrl = "https://shalean.co.za/api/marketing/unsubscribe";
function token() {
  return createMarketingUnsubscribeToken(uuid, secret, 3)!;
}
function admin(profile: { billing_email: string; role: string } | null = {
  billing_email: "synthetic@example.test", role: "customer",
}) {
  return { from: vi.fn(() => ({
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        maybeSingle: vi.fn(async () => ({ data: profile, error: null })),
      })),
    })),
  })) };
}
describe("synthetic one-click unsubscribe route — no provider traffic", () => {
  beforeEach(() => {
    vi.stubEnv("MARKETING_UNSUBSCRIBE_SECRET", secret);
    vi.stubEnv("RESEND_API_KEY", "");
    mocks.getAdmin.mockReset();
    mocks.record.mockReset();
    mocks.getAdmin.mockReturnValue(admin());
    mocks.record.mockResolvedValue({ok:true,providerSync:"retry_required"});
  });
  afterEach(() => vi.unstubAllEnvs());

  it("GET only renders confirmation, no CRM mutation", async () => {
    const result = await GET(new Request(baseUrl+"?token="+token()));
    expect(result.status).toBe(200);
    expect((await result.text())).toContain("Unsubscribe from marketing emails");
    expect(mocks.record).not.toHaveBeenCalled();
    expect(mocks.getAdmin).not.toHaveBeenCalled();
  });
  it("invalid signature never reads customer data", async () => {
    const result = await POST(new Request(baseUrl, {
      method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({token:"fake.invalid"}),
    }));
    expect(result.status).toBe(400);
    expect(mocks.record).not.toHaveBeenCalled();
    expect(mocks.getAdmin).not.toHaveBeenCalled();
  });
  it("POST valid signed token withdraws without actual provider call", async () => {
    const result = await POST(new Request(baseUrl, {
      method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({token:token()}),
    }));
    expect(result.status).toBe(200);
    expect(await result.json()).toMatchObject({ok:true,unsubscribed:true});
    expect(mocks.record).toHaveBeenCalledTimes(1);
    expect(mocks.record.mock.calls[0][1]).toMatchObject({
      customerId:uuid,authenticatedEmail:"synthetic@example.test",
      decision:"withdrawn",explicitOptIn:false,source:"signed_one_click",
    });
  });
  it("a failed CRM write is not reported as successful", async () => {
    mocks.record.mockResolvedValue({ok:false,reason:"consent_write_failed"});
    const result = await POST(new Request(baseUrl+"?token="+token(),{method:"POST"}));
    expect(result.status).toBe(503);
  });
  it("non-customer cannot unsubscribe another account", async () => {
    mocks.getAdmin.mockReturnValue(admin({billing_email:"synthetic@example.test",role:"admin"}));
    const result = await POST(new Request(baseUrl+"?token="+token(),{method:"POST"}));
    expect(result.status).toBe(503);
    expect(mocks.record).not.toHaveBeenCalled();
  });
});

function legacyToken() {
  const encoded=Buffer.from(JSON.stringify({uid:uuid,exp:Math.floor(Date.now()/1000)+3600,v:1})).toString("base64url");
  return encoded+"."+createHmac("sha256",secret).update(encoded).digest("base64url");
}
describe("generation revocation and legacy confirmation",()=>{
  beforeEach(()=>{vi.stubEnv("MARKETING_UNSUBSCRIBE_SECRET",secret);mocks.getAdmin.mockReset();mocks.record.mockReset();});
  afterEach(()=>vi.unstubAllEnvs());
  it("v1 GET offers account preferences without a token-bearing form or database access",async()=>{
    const response=await GET(new Request(baseUrl+"?token="+legacyToken()));
    const html=await response.text();
    expect(response.status).toBe(200);expect(html).toContain('/account/profile');expect(html).not.toContain('<form');
    expect(mocks.getAdmin).not.toHaveBeenCalled();expect(mocks.record).not.toHaveBeenCalled();
  });
  it("v1 POST cannot mutate even if its signature and expiry are valid",async()=>{
    const response=await POST(new Request(baseUrl+"?token="+legacyToken(),{method:"POST"}));
    expect(response.status).toBe(409);expect(mocks.getAdmin).not.toHaveBeenCalled();expect(mocks.record).not.toHaveBeenCalled();
  });
  it("v2 carries the signed generation to the atomic operation",async()=>{
    mocks.getAdmin.mockReturnValue(admin());mocks.record.mockResolvedValue({ok:true});
    const response=await POST(new Request(baseUrl+"?token="+token(),{method:"POST"}));
    expect(response.status).toBe(200);expect(mocks.record.mock.calls[0]![1]).toMatchObject({tokenGeneration:3});
  });
  it("superseded links return a conflict, not a successful withdrawal",async()=>{
    mocks.getAdmin.mockReturnValue(admin());mocks.record.mockResolvedValue({ok:false,reason:"unsubscribe_token_superseded"});
    const response=await POST(new Request(baseUrl+"?token="+token(),{method:"POST"}));
    expect(response.status).toBe(409);expect(await response.json()).not.toHaveProperty('unsubscribed');
  });
});
