import { expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { applyProviderPreferenceWithdrawal } from "../providerPreferenceWebhook";
function db(outcome = "new", error: unknown = null, lookupError: unknown = null) {
  const rpc = vi.fn(async () => ({ data: [{ outcome }], error }));
  const forbidden = vi.fn(() => { throw Error("Non-atomic provider evidence/profile write"); });
  const client = { rpc, from: () => ({ select: () => ({ ilike: () => ({ eq: () => ({ limit: async () => ({ data: [{ id: "synthetic-customer" }], error: lookupError }) }) }) }), insert: forbidden, update: forbidden }) } as unknown as SupabaseClient;
  return { client, rpc, forbidden };
}
const event = { type: "contact.updated", email: "A@EXAMPLE.COM", unsubscribed: true, svixId: "synthetic-event-1" };
it.each(["new", "replay_completed", "superseded"])("provider withdrawal accepts atomic %s without separate writes", async outcome => {
  const f = db(outcome); expect(await applyProviderPreferenceWithdrawal(f.client, event)).toEqual({ ok: true });
  expect(f.rpc).toHaveBeenCalledWith("marketing_record_provider_withdrawal_atomic", expect.objectContaining({ p_email: "a@example.com", p_evidence_reference: event.svixId }));
  expect(f.forbidden).not.toHaveBeenCalled();
});
it.each([false, null, undefined])("never interprets provider re-subscription/unknown preference as consent (%s)", async unsubscribed => {
  const f = db(); expect(await applyProviderPreferenceWithdrawal(f.client, { ...event, unsubscribed })).toEqual({ ok: true }); expect(f.rpc).not.toHaveBeenCalled();
});
it("invalid identity fails before any transaction", async () => {
  const f = db(); expect((await applyProviderPreferenceWithdrawal(f.client, { ...event, email: "bad" })).ok).toBe(false); expect(f.rpc).not.toHaveBeenCalled();
});
it("database lookup and transaction failures are not acknowledged as success", async () => {
  const f = db("new", { code: "42501" }); expect((await applyProviderPreferenceWithdrawal(f.client, event)).ok).toBe(false);
  const missing = db("new", null, { message: "unavailable" }); expect((await applyProviderPreferenceWithdrawal(missing.client, event)).ok).toBe(false); expect(missing.rpc).not.toHaveBeenCalled();
});
it("unexpected transaction output fails closed", async () => {
  const f = db("unknown"); expect((await applyProviderPreferenceWithdrawal(f.client, event)).ok).toBe(false);
});
