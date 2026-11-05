import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

const mocks = vi.hoisted(() => ({
  gate: vi.fn(), send: vi.fn(), settings: vi.fn(), credit: vi.fn(), code: vi.fn(), paused: vi.fn(),
}));
vi.mock("@/lib/email/marketingSendGate", () => ({ checkMarketingSendGate: mocks.gate }));
vi.mock("@/lib/email/safeResendSend", () => ({ safeResendSend: mocks.send }));
vi.mock("@/lib/notifications/customerOutboundPause", () => ({ isCustomerOutboundPaused: mocks.paused }));
vi.mock("@/lib/referrals/settings", () => ({ getReferralProgramSettings: mocks.settings }));
vi.mock("@/lib/referrals/credits", () => ({ getCreditSummary: mocks.credit }));
vi.mock("@/lib/referrals/server", () => ({ getOrCreateCustomerReferralCode: mocks.code }));
vi.mock("@/lib/email/appUrl", () => ({ getPublicAppUrlBase: () => "https://shalean.co.za" }));
vi.mock("@/lib/email/sendBookingEmail", () => ({ getDefaultFromAddress: () => "Shalean <notices@shalean.co.za>" }));
vi.mock("@/lib/logging/systemLog", () => ({ reportOperationalIssue: vi.fn() }));
import { sendReferralCampaignEmail } from "../referralCampaignEmail";

const id = "00000000-0000-4000-8000-000000000777";
const to = "synthetic@example.test";
const secret = "test-only-long-unsubscribe-secret-with-32-characters";
function fakeAdmin() {
  const writes: { campaignRows: Record<string,unknown>[]; updates: Record<string,unknown>[] } = {
    campaignRows:[],updates:[],
  };
  const known = new Set<string>();
  let hasDuplicate = false;
  const admin = { from(table: string) {
    if (table === "email_campaigns") return { select: () => ({eq:()=>({
      maybeSingle: async()=>({data:{enabled:true,subject_template:"Referral {{first_name}}"},error:null}),
    })})};
    if (table === "email_campaign_sends") return {
      insert: (row: Record<string,unknown>) => ({
        select: () => ({ single: async()=> {
          if (row.idempotency_key && known.has(String(row.idempotency_key))) {
            hasDuplicate = true;
            return {data:null,error:{code:"23505",message:"unique violation"}};
          }
          if (row.idempotency_key) known.add(String(row.idempotency_key));
          writes.campaignRows.push(row);
          return {data:{id:"synthetic-send-row"},error:null};
        }}),
      }),
      update: (patch: Record<string,unknown>) => ({
        eq: async()=> { writes.updates.push(patch); return {error:null}; },
      }),
    };
    throw Error("Unexpected mock table "+table);
  }} as unknown as SupabaseClient;
  return {admin,writes,hasDuplicate:()=>hasDuplicate};
}
describe("Gate 3 referral path synthetic journey",()=>{
  beforeEach(()=>{
    vi.clearAllMocks();
    vi.stubEnv("MARKETING_UNSUBSCRIBE_SECRET",secret);
    mocks.gate.mockResolvedValue({allowed:true});
    mocks.send.mockResolvedValue({data:{id:"synthetic-provider"},error:null});
    mocks.settings.mockResolvedValue({enabled:true,rewardAmountZar:100});
    mocks.credit.mockResolvedValue({balance:0});
    mocks.code.mockResolvedValue("test-referral-code");
    mocks.paused.mockResolvedValue({paused:false});
  });
  afterEach(()=>vi.unstubAllEnvs());
  it("one eligible referral creates a single audit send with unsubscribe headers",async()=>{
    const {admin,writes}=fakeAdmin();
    const result=await sendReferralCampaignEmail({admin,userId:id,email:to,firstName:"Synthetic"});
    expect(result.sent).toBe(true);
    expect(writes.campaignRows).toHaveLength(1);
    expect(mocks.send).toHaveBeenCalledTimes(1);
    const payload=mocks.send.mock.calls[0][0];
    expect(payload.context).toMatchObject({customerId:id,messageType:"referral_campaign"});
    expect(payload.headers["List-Unsubscribe"]).toContain("https://shalean.co.za/api/marketing/unsubscribe");
    expect(payload.headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
  });
  it("same-month duplicate idempotency prevents second send",async()=>{
    const {admin}=fakeAdmin();
    const request={admin,userId:id,email:to};
    const first=await sendReferralCampaignEmail(request);
    const second=await sendReferralCampaignEmail(request);
    expect(first.sent).toBe(true);
    expect(second.sent).toBe(false);
    expect(second.error).toBe("Already sent this month.");
    expect(mocks.send).toHaveBeenCalledTimes(1);
  });
  it("opt-out blocks before credit lookup and outbound insert",async()=>{
    mocks.gate.mockResolvedValue({allowed:false,reason:"unsubscribed"});
    const {admin,writes}=fakeAdmin();
    const out=await sendReferralCampaignEmail({admin,userId:id,email:to});
    expect(out).toMatchObject({sent:false,error:"marketing_eligibility_unsubscribed"});
    expect(mocks.credit).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
    expect(writes.campaignRows).toHaveLength(0);
  });
  it("provider failure leaves send marked failed for review",async()=>{
    mocks.send.mockResolvedValue({data:null,error:{message:"synthetic provider 503"}});
    const {admin,writes}=fakeAdmin();
    const out=await sendReferralCampaignEmail({admin,userId:id,email:to});
    expect(out.sent).toBe(false);
    expect(writes.updates.some(x=>x.status==="failed")).toBe(true);
  });
});
