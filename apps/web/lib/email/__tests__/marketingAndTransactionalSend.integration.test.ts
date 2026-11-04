import { beforeEach, describe, expect, it, vi } from "vitest";

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
const auditRows: Record<string, unknown>[] = [];
const marketing = () => ({
  from: "Shalean <notices@shalean.co.za>", to, subject: "Synthetic referral",
  html: "<p>synthetic</p>",
  tags: [{ name: "message_type", value: "referral_campaign" }],
  context: { customerId, messageType: "referral_campaign", campaignId: "synthetic-campaign" },
});
describe("Gate 3 integration: send wrapper + synthetic provider, NO external email", () => {
  beforeEach(() => {
    vi.clearAllMocks(); auditRows.length = 0;
    mock.send.mockResolvedValue({ data: { id: "synthetic-provider-id" }, error: null });
    mock.eligibility.mockResolvedValue({ allowed: true });
    mock.getAdmin.mockReturnValue({
      from: (name: string) => {
        if (name !== "email_outbound_messages") throw Error("unexpected table");
        return { insert: async (row: Record<string, unknown>) => {
          auditRows.push(row); return { error: null };
        }};
      },
    });
  });
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

});
