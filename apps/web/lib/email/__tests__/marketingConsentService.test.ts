import { test } from "vitest";
import { strict as assert } from "node:assert";
import type { SupabaseClient } from "@supabase/supabase-js";
import { MARKETING_POLICY_VERSION, recordCustomerMarketingDecision } from "../marketingConsentService";

type Row = { billing_email: string; role: string; id: string };
function fakeClient(options: { profile?: Row; failRead?: boolean; failLedger?: boolean; failUpdate?: boolean; failQueue?: boolean } = {}) {
  const writes: { table: string; payload: Record<string, unknown> }[] = [];
  const admin = { from(table: string) {
    return {
      select() { return { eq() { return { maybeSingle: async () => ({
        data: options.profile ?? { id: "customer-a", billing_email: "a@example.com", role: "customer" },
        error: options.failRead ? { message: "db down" } : null,
      }) }; } }; },
      insert(payload: Record<string, unknown>) { writes.push({ table, payload }); return Promise.resolve({
        error: options.failLedger ? { message: "write blocked" } : null,
      }); },
      upsert(payload: Record<string, unknown>) { writes.push({ table, payload }); return Promise.resolve({
        error: options.failQueue ? { message: "queue write blocked" } : null,
      }); },
      update(payload: Record<string, unknown>) { writes.push({ table, payload }); return {
        eq: async () => ({ error: options.failUpdate ? { message: "write blocked" } : null }),
      }; },
    };
  }} as unknown as SupabaseClient;
  return { admin, writes };
}
const base = { customerId: "customer-a", authenticatedEmail: "a@example.com",
  decision: "granted" as const, explicitOptIn: true, evidenceReference: "test-evidence",
  source: "authenticated_preferences" as const };
test("policy version fixed", () => assert.equal(MARKETING_POLICY_VERSION, "marketing-email-2026-11-v1"));
test("no affirmative checkbox -> no write", async () => {
  const {admin,writes}=fakeClient();
  const result=await recordCustomerMarketingDecision(admin,{...base,explicitOptIn:false});
  assert.deepEqual(result,{ok:false,reason:"explicit_opt_in_required"}); assert.equal(writes.length,0);
});
test("identity mismatch -> no consent write", async () => {
  const {admin,writes}=fakeClient({profile:{id:"customer-a",billing_email:"else@example.com",role:"customer"}});
  const result=await recordCustomerMarketingDecision(admin,base);
  assert.deepEqual(result,{ok:false,reason:"customer_identity_unverified"}); assert.equal(writes.length,0);
});
test("database read failure fails closed", async () => {
  const {admin,writes}=fakeClient({failRead:true});
  const result=await recordCustomerMarketingDecision(admin,base);
  assert.equal(result.ok,false); assert.equal(writes.length,0);
});
test("consent write failure returns error", async () => {
  const {admin}=fakeClient({failLedger:true});
  const result=await recordCustomerMarketingDecision(admin,base);
  assert.deepEqual(result,{ok:false,reason:"consent_write_failed"});
});
test("grants do not silently clear previous unsubscribe", async () => {
  const {admin,writes}=fakeClient();
  const result=await recordCustomerMarketingDecision(admin,base);
  assert.deepEqual(result,{ok:true,providerSync:"retry_required"});
  assert.equal(writes.length,2);
  assert.equal(writes[0]?.table,"marketing_email_consent_events");
  assert.equal(writes[0]?.payload.decision,"granted");
  assert.equal(writes[1]?.table,"marketing_email_enrollment_jobs");
  assert.equal(writes[1]?.payload.status,"pending");
});
test("withdrawal writes durable audit then CRM opt-out", async () => {
  const {admin,writes}=fakeClient();
  const result=await recordCustomerMarketingDecision(admin,{...base,decision:"withdrawn",explicitOptIn:false});
  assert.deepEqual(result,{ok:true,providerSync:"retry_required"});
  assert.deepEqual(writes.map(x=>x.table),["marketing_email_consent_events","user_profiles","marketing_email_reconciliation_jobs"]);
  assert.equal(writes[0]?.payload.decision,"withdrawn");
  assert.ok(writes[1]?.payload.marketing_emails_unsubscribed_at);
});
test("failed CRM update remains an audited withdrawal", async () => {
  const {admin,writes}=fakeClient({failUpdate:true});
  const result=await recordCustomerMarketingDecision(admin,{...base,decision:"withdrawn",explicitOptIn:false});
  assert.deepEqual(result,{ok:false,reason:"unsubscribe_profile_sync_failed"});
  assert.equal(writes[0]?.payload.decision,"withdrawn");
});

test("enrollment queue failure is explicitly reported rather than silently claiming enrollment",async()=>{
  const {admin,writes}=fakeClient({failQueue:true});
  const result=await recordCustomerMarketingDecision(admin,base);
  assert.deepEqual(result,{ok:false,reason:"enrollment_queue_write_failed"});
  assert.equal(writes[0]?.table,"marketing_email_consent_events");
  assert.equal(writes[1]?.table,"marketing_email_enrollment_jobs");
});
