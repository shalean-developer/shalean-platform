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
  return createMarketingUnsubscribeToken(uuid, secret)!;
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
