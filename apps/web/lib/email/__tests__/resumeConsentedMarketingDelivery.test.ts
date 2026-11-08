import { afterEach, expect, test, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { resumeConsentedMarketingDelivery } from "../resumeConsentedMarketingDelivery";
import { readResendMarketingState } from "../readResendMarketingState";
vi.mock("../readResendMarketingState", () => ({ readResendMarketingState: vi.fn() }));
const input = { customerId: "synthetic-id", email: "resume@example.test", evidenceReference: "new-grant", apiKey: "synthetic" };
function fixture(generation: number | null = 2, result: unknown = true, error: unknown = null) {
  const rpc = vi.fn(async () => ({ data: result, error }));
  const maybeSingle = vi.fn(async () => ({ data: { marketing_consent_generation: generation }, error: null }));
  const q = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle };
  return { admin: { from: vi.fn(() => q), rpc } as unknown as SupabaseClient, rpc };
}
afterEach(() => vi.resetAllMocks());
test("verified subscribed unsuppressed provider permits generation/evidence fenced resume", async () => {
  vi.mocked(readResendMarketingState).mockResolvedValue({ verified: true, unsubscribed: false, suppressed: false });
  const f = fixture();
  expect(await resumeConsentedMarketingDelivery(f.admin, input)).toBe(true);
  expect(f.rpc).toHaveBeenCalledWith("marketing_resume_consented_delivery_atomic", {
    p_customer_id: input.customerId, p_email: input.email, p_generation: 2, p_evidence_reference: "new-grant",
  });
});
test.each([
  { verified: false, unsubscribed: null, suppressed: null },
  { verified: true, unsubscribed: true, suppressed: false },
  { verified: true, unsubscribed: false, suppressed: true },
  { verified: true, unsubscribed: null, suppressed: false },
])("unknown or blocked provider never invokes resume: %j", async state => {
  vi.mocked(readResendMarketingState).mockResolvedValue(state);
  const f = fixture();
  expect(await resumeConsentedMarketingDelivery(f.admin, input)).toBe(false);
  expect(f.rpc).not.toHaveBeenCalled();
});
test.each([null, 0, -1, 1.5])("invalid generation %s cannot resume", async generation => {
  const f = fixture(generation);
  expect(await resumeConsentedMarketingDelivery(f.admin, input)).toBe(false);
  expect(readResendMarketingState).not.toHaveBeenCalled();
  expect(f.rpc).not.toHaveBeenCalled();
});
test.each([[false, null], [null, null], [true, { code: "P0001" }], [[true], null]])("RPC denial/error/unexpected shape stays paused", async (result, error) => {
  vi.mocked(readResendMarketingState).mockResolvedValue({ verified: true, unsubscribed: false, suppressed: false });
  expect(await resumeConsentedMarketingDelivery(fixture(2, result, error).admin, input)).toBe(false);
});
test("provider failure leaves consent recorded and delivery paused", async () => {
  vi.mocked(readResendMarketingState).mockRejectedValue(new Error("offline"));
  const f = fixture();
  expect(await resumeConsentedMarketingDelivery(f.admin, input)).toBe(false);
  expect(f.rpc).not.toHaveBeenCalled();
});
