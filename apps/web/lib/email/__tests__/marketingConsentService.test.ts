import { afterEach, expect, test, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  MARKETING_POLICY_VERSION,
  recordCustomerMarketingDecision,
} from "../marketingConsentService";

const base = {
  customerId: "00000000-0000-4000-8000-000000000777",
  authenticatedEmail: "synthetic@example.test",
  decision: "granted" as const,
  explicitOptIn: true,
  evidenceReference: "synthetic-evidence",
  source: "authenticated_preferences" as const,
};

function fixture(outcome = "retry_required", error: unknown = null) {
  const rpc = vi.fn(async () => ({
    data: error ? null : [{ outcome }],
    error,
  }));
  const from = vi.fn(() => {
    throw new Error("Unexpected direct database access");
  });
  return {
    admin: { rpc, from } as unknown as SupabaseClient,
    rpc,
    from,
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

test("policy version remains fixed", () => {
  expect(MARKETING_POLICY_VERSION).toBe("marketing-email-2026-11-v1");
});

test("grant without affirmative opt-in makes no RPC call", async () => {
  const f = fixture();
  expect(await recordCustomerMarketingDecision(f.admin, {
    ...base, explicitOptIn: false,
  })).toEqual({ ok: false, reason: "explicit_opt_in_required" });
  expect(f.rpc).not.toHaveBeenCalled();
});

test("grant uses the atomic transaction with verified input arguments", async () => {
  const f = fixture();
  expect(await recordCustomerMarketingDecision(f.admin, base))
    .toEqual({ ok: true, providerSync: "retry_required" });
  expect(f.rpc).toHaveBeenCalledWith(
    "marketing_record_consent_decision_atomic",
    expect.objectContaining({
      p_customer_id: base.customerId,
      p_email: base.authenticatedEmail,
      p_decision: "granted",
      p_source: "authenticated_preferences",
      p_explicit_opt_in: true,
      p_policy_version: MARKETING_POLICY_VERSION,
    }),
  );
  expect(f.from).not.toHaveBeenCalled();
});

test("withdrawal uses the same atomic transaction", async () => {
  const f = fixture("new");
  const result = await recordCustomerMarketingDecision(f.admin, {
    ...base,
    decision: "withdrawn",
    source: "signed_one_click",
    explicitOptIn: false,
  });
  expect(result).toEqual({ ok: true, providerSync: "retry_required" });
  expect(f.rpc).toHaveBeenCalledWith(
    "marketing_record_consent_decision_atomic",
    expect.objectContaining({
      p_decision: "withdrawn",
      p_source: "signed_one_click",
      p_evidence_reference: base.evidenceReference,
    }),
  );
  expect(f.from).not.toHaveBeenCalled();
});

test("identity failure reported by transaction fails closed", async () => {
  const f = fixture("", { code: "42501" });
  expect(await recordCustomerMarketingDecision(f.admin, base))
    .toEqual({ ok: false, reason: "consent_transaction_failed" });
});

test("transaction error does not claim consent success", async () => {
  const f = fixture("", { code: "23505" });
  expect(await recordCustomerMarketingDecision(f.admin, base))
    .toEqual({ ok: false, reason: "consent_transaction_failed" });
});

test("queue or transaction failure fails closed", async () => {
  const f = fixture("", { code: "P0001" });
  expect((await recordCustomerMarketingDecision(f.admin, base)).ok)
    .toBe(false);
});

test("unexpected transaction result is rejected", async () => {
  const f = fixture("unknown");
  expect((await recordCustomerMarketingDecision(f.admin, base)).ok)
    .toBe(false);
});

test("superseded signed unsubscribe is rejected", async () => {
  const f = fixture("superseded");
  const result = await recordCustomerMarketingDecision(f.admin, {
    ...base,
    decision: "withdrawn",
    source: "signed_one_click",
    explicitOptIn: false,
  });
  expect(result).toEqual({
    ok: false,
    reason: "unsubscribe_token_superseded",
  });
});

test("staging consent request makes no direct provider or table calls", async () => {
  vi.stubEnv("SHALEAN_APP_ENV", "staging");
  vi.stubEnv("RESEND_CONTACT_WRITES_DISABLED", "false");
  const f = fixture("new");
  const fetchSpy = vi.spyOn(globalThis, "fetch");

  const result = await recordCustomerMarketingDecision(f.admin, {
    ...base,
    decision: "withdrawn",
    source: "signed_one_click",
    explicitOptIn: false,
    apiKey: "synthetic-key",
  });

  expect(result.ok).toBe(true);
  expect(f.rpc).toHaveBeenCalledOnce();
  expect(f.from).not.toHaveBeenCalled();
  expect(fetchSpy).not.toHaveBeenCalled();
});
