import { afterEach, expect, test, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { recordCustomerMarketingDecision } from "../marketingConsentService";

const input = {
  customerId: "00000000-0000-4000-8000-000000000777",
  authenticatedEmail: "synthetic@example.test",
  decision: "withdrawn" as const,
  explicitOptIn: false,
  evidenceReference: "sha256-of-synthetic-token",
  source: "signed_one_click" as const,
};
function db(outcome: string, error: unknown = null) {
  const rpc = vi.fn(async (_name: string, _args: Record<string, unknown>) => ({ data: error ? null : [{ outcome }], error }));
  const from = vi.fn(() => { throw Error("Non-atomic client table access"); });
  return { admin: { rpc, from } as unknown as SupabaseClient, rpc, from };
}
afterEach(() => vi.clearAllMocks());

test.each(["new", "replay_completed", "retry_required"])(
  "atomic signed withdrawal accepts %s without direct table/provider writes", async outcome => {
    const { admin, rpc, from } = db(outcome);
    const actual = await recordCustomerMarketingDecision(admin, input);
    expect(actual).toMatchObject({ ok: true });
    expect(rpc).toHaveBeenCalledOnce();
    expect(rpc.mock.calls[0]![0]).toBe("marketing_record_consent_decision_atomic");
    expect(from).not.toHaveBeenCalled();
  },
);
test("atomic transaction error fails closed", async () => {
  const { admin } = db("", { code: "23505" });
  expect(await recordCustomerMarketingDecision(admin, input)).toEqual({
    ok: false, reason: "consent_transaction_failed",
  });
});
test("unexpected RPC output fails closed", async () => {
  const { admin } = db("unexpected");
  expect((await recordCustomerMarketingDecision(admin, input)).ok).toBe(false);
});
test("explicit opt-in required before grant transaction", async () => {
  const { admin, rpc } = db("retry_required");
  expect((await recordCustomerMarketingDecision(admin, {
    ...input, source:"authenticated_preferences", decision:"granted", explicitOptIn:false,
  })).ok).toBe(false);
  expect(rpc).not.toHaveBeenCalled();
});
test("grant uses the same atomic RPC", async () => {
  const { admin, rpc } = db("retry_required");
  expect((await recordCustomerMarketingDecision(admin, {
    ...input, source:"authenticated_preferences", decision:"granted", explicitOptIn:true,
  })).ok).toBe(true);
  expect(rpc).toHaveBeenCalledOnce();
});

test("superseded signed withdrawal is rejected", async () => {
  const { admin, rpc, from } = db("superseded");

  const result = await recordCustomerMarketingDecision(admin, input);

  expect(result).toEqual({
    ok: false,
    reason: "unsubscribe_token_superseded",
  });
  expect(rpc).toHaveBeenCalledOnce();
  expect(from).not.toHaveBeenCalled();
});
