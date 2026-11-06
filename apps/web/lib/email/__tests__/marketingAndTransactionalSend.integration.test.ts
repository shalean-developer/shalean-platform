import { verifyMarketingUnsubscribeToken } from "../marketingUnsubscribeToken";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
  send: vi.fn(),
  getAdmin: vi.fn(),
  eligibility: vi.fn(),
  audienceCreate: vi.fn(),
}));
vi.mock("@/lib/email/resendFrom", () => ({ getResend: () => ({ emails: { send: mock.send } }) }));
vi.mock("@/lib/supabase/admin", () => ({ getSupabaseAdmin: mock.getAdmin }));
vi.mock("@/lib/email/marketingSendGate", () => ({ checkMarketingSendGate: mock.eligibility }));
vi.mock("@/lib/env/outboundMessagingSafety", () => ({
  decideOutboundEmail: () => ({ allowed: true, subjectPrefix: "" }),
  applyOutboundSubjectPrefix: (subject: string) => subject,
}));
import { safeResendSend } from "../safeResendSend";

const customerId = "00000000-0000-4000-8000-000000000777";
const to = "synthetic@example.test";
let generation=3;
const auditRows: Record<string, unknown>[] = [];
const marketing = () => ({
  from: "Shalean <notices@shalean.co.za>", to, subject: "Synthetic referral",
  html: "<p>synthetic</p>",
  tags: [{ name: "message_type", value: "referral_campaign" }],
  context: { customerId, messageType: "referral_campaign", campaignId: "synthetic-campaign" },
});
describe("Gate 3 integration: send wrapper + synthetic provider, NO external email", () => {
  beforeEach(() => {
    vi.clearAllMocks(); auditRows.length = 0; generation=3;
    vi.stubEnv("MARKETING_UNSUBSCRIBE_SECRET", "synthetic-secret-of-at-least-32-characters");
    mock.send.mockResolvedValue({ data: { id: "synthetic-provider-id" }, error: null });
    mock.eligibility.mockResolvedValue({ allowed: true });
    mock.getAdmin.mockReturnValue({
      from: (name: string) => {
        if(name === "user_profiles") return {select:()=>({eq:()=>({maybeSingle:async()=>({data:{role:"customer",billing_email:to,marketing_consent_generation:generation},error:null})})})};
        if (name !== "email_outbound_messages") throw Error("unexpected table");
        return { insert: async (row: Record<string, unknown>) => {
          auditRows.push(row); return { error: null };
        }};
      },
    });
  });
  afterEach(()=>vi.unstubAllEnvs());
  it("consented referral transmits only to mocked provider and preserves context", async () => {
    const result = await safeResendSend(marketing());
    expect(result.error).toBeNull();
    expect(mock.eligibility).toHaveBeenCalledWith(expect.anything(),customerId,to);
    expect(mock.send).toHaveBeenCalledTimes(1);
    expect(mock.send.mock.calls[0][0].to).toBe(to);
    expect(auditRows).toHaveLength(1);
    expect(auditRows[0]).toMatchObject({ recipient_email:to, customer_id:customerId,
      message_type:"referral_campaign", delivery_status:"sent" });
  });
  it("after withdrawal, a promotional retry is blocked before provider submission", async () => {
    await safeResendSend(marketing());
    mock.eligibility.mockResolvedValue({ allowed:false, reason:"unsubscribed" });
    const retry = await safeResendSend(marketing());
    expect(retry.error?.message).toBe("marketing_eligibility_unsubscribed");
    expect(mock.send).toHaveBeenCalledTimes(1);
  });
  it("missing consent blocks marketing, no provider call and no outbound tracking row", async () => {
    mock.eligibility.mockResolvedValue({ allowed:false, reason:"no_affirmative_consent" });
    const result = await safeResendSend(marketing());
    expect(result.error?.name).toBe("marketing_eligibility");
    expect(mock.send).not.toHaveBeenCalled();
    expect(auditRows).toHaveLength(0);
  });
  it("provider suppression blocks marketing even when prior permission existed", async () => {
    mock.eligibility.mockResolvedValue({ allowed:false, reason:"suppressed" });
    const result = await safeResendSend(marketing());
    expect(result.error?.message).toContain("suppressed");
    expect(mock.send).not.toHaveBeenCalled();
  });
  it("marketing without verified customer identity fails closed", async () => {
    const payload = { ...marketing(), context: { messageType:"referral_campaign" } };
    mock.eligibility.mockResolvedValue({ allowed:false, reason:"unverified_customer" });
    await safeResendSend(payload);
    expect(mock.eligibility).toHaveBeenCalledWith(expect.anything(),null,to);
    expect(mock.send).not.toHaveBeenCalled();
  });
  it("booking confirmation does not consult marketing-consent eligibility", async () => {
    mock.eligibility.mockResolvedValue({ allowed:false, reason:"no_affirmative_consent" });
    const result = await safeResendSend({
      from:"Shalean <notices@shalean.co.za>",to,subject:"Booking confirmed",
      html:"<p>Booked</p>",context:{customerId,messageType:"booking_confirmation"},
    });
    expect(result.error).toBeNull();
    expect(mock.eligibility).not.toHaveBeenCalled();
    expect(mock.send).toHaveBeenCalledTimes(1);
    expect(auditRows[0]?.message_type).toBe("booking_confirmation");
  });
  it("provider transient failure records a retryable marketing message", async () => {
    mock.send.mockResolvedValue({ data:null, error: {message:"synthetic provider 503",name:"service_error"} });
    const result = await safeResendSend(marketing());
    expect(result.error?.message).toContain("503");
    expect(auditRows[0]).toMatchObject({ delivery_status:"send_failed",retry_status:"queued" });
  });
  it.each(["password_reset","payment_receipt","booking_confirmation","security_code","booking_reminder"])(
    "essential %s email ignores marketing opt-out",async(messageType)=>{
      mock.eligibility.mockResolvedValue({allowed:false,reason:"unsubscribed"});
      const outcome=await safeResendSend({
        from:"Shalean <notices@shalean.co.za>",to,subject:"Synthetic essential notice",
        html:"<p>synthetic</p>",context:{customerId,messageType},
      });
      expect(outcome.error).toBeNull();
      expect(mock.eligibility).not.toHaveBeenCalled();
      expect(mock.send).toHaveBeenCalledTimes(1);
      expect(auditRows[0]?.message_type).toBe(messageType);
    },
  );

  it("stored marketing retries refresh unsubscribe headers to the current generation",async()=>{
    const request={...marketing(),headers:{"list-unsubscribe":"<https://shalean.co.za/old-v1-link>"}};
    expect((await safeResendSend(request)).error).toBeNull();
    generation=4;
    expect((await safeResendSend(request)).error).toBeNull();
    for(const [index, expected] of [3,4].entries()) {
      const headers=mock.send.mock.calls[index]![0].headers;
      expect(headers).not.toHaveProperty("list-unsubscribe");
      const url=new URL(headers["List-Unsubscribe"].slice(1,-1));
      expect(verifyMarketingUnsubscribeToken(url.searchParams.get("token")!,process.env.MARKETING_UNSUBSCRIBE_SECRET))
        .toMatchObject({version:2,generation:expected});
      expect(auditRows[index]!.headers).toEqual(headers);
    }
  });

});

describe("all promotional send paths", () => {
  beforeEach(() => {
    vi.clearAllMocks(); auditRows.length=0;
    mock.send.mockResolvedValue({data:{id:"synthetic"},error:null});
    mock.eligibility.mockResolvedValue({allowed:false,reason:"unsubscribed"});
    mock.getAdmin.mockReturnValue({});
  });
  it.each(["growth_retention_reminder","growth_win_back","rebook_email","rebook_reminder_email"])("blocks opted-out %s before provider submission",async messageType=>{
    const result=await safeResendSend({...marketing(),tags:[],context:{customerId,messageType}});
    expect(result.error?.message).toContain("unsubscribed");
    expect(mock.send).not.toHaveBeenCalled();
  });
  it("rejects multiple recipients before checking only one customer's consent",async()=>{
    mock.eligibility.mockResolvedValue({allowed:true});
    const result=await safeResendSend({...marketing(),to:[to,"another@example.test"]});
    expect(result.error?.message).toBe("marketing_single_recipient_required");
    expect(mock.send).not.toHaveBeenCalled();
  });
  it("cannot disguise a marketing tag with transactional context",async()=>{
    const result=await safeResendSend({...marketing(),context:{customerId,messageType:"booking_confirmation"}});
    expect(result.error?.message).toBe("marketing_message_type_conflict");
    expect(mock.send).not.toHaveBeenCalled();
  });
});
