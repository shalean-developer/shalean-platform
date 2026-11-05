import { test } from "vitest";
import { strict as assert } from "node:assert";
import type { SupabaseClient } from "@supabase/supabase-js";
import { applyProviderPreferenceWithdrawal } from "../providerPreferenceWebhook";

function db(options: { failFind?: boolean; failConsent?: boolean; failUpdate?: boolean; duplicate?: boolean } = {}) {
  const writes: Array<{table:string, type:string, payload:Record<string, unknown>}> = [];
  const client = { from(table: string) {
    return {
      select() { return { eq() { return { eq() { return { limit: async() => ({
        data: [{ id:"customer-a" }], error: options.failFind ? {message:"down"} : null,
      }) }; } }; } }; },
      insert(payload: Record<string,unknown>) {
        writes.push({table,type:"insert",payload});
        return Promise.resolve({error: options.failConsent ? {code:"42P01"} : options.duplicate ? {code:"23505"} : null});
      },
      update(payload:Record<string,unknown>) {
        writes.push({table,type:"update",payload});
        return {eq:async()=>({error:options.failUpdate ? {code:"42501"} : null})};
      },
    };
  }} as unknown as SupabaseClient;
  return {client,writes};
}
const event = {type:"contact.updated", email:"A@EXAMPLE.COM", unsubscribed:true, svixId:"evt-1"};
test("ignores provider re-subscription events", async() => {
  const {client,writes}=db();
  assert.deepEqual(await applyProviderPreferenceWithdrawal(client,{...event,unsubscribed:false}),{ok:true});
  assert.equal(writes.length,0);
});
test("signed provider opt-out records ledger and CRM", async() => {
  const {client,writes}=db();
  assert.deepEqual(await applyProviderPreferenceWithdrawal(client,event),{ok:true});
  assert.deepEqual(writes.map(x=>x.table),["marketing_email_consent_events","user_profiles"]);
  assert.equal(writes[0]?.payload.email,"a@example.com");
  assert.equal(writes[0]?.payload.decision,"withdrawn");
});
test("idempotent replay continues CRM sync after duplicate consent event", async() => {
  const {client,writes}=db({duplicate:true});
  assert.deepEqual(await applyProviderPreferenceWithdrawal(client,event),{ok:true});
  assert.equal(writes.length,2);
});
test("bad email fails closed before writes",async()=>{
  const {client,writes}=db();
  const out=await applyProviderPreferenceWithdrawal(client,{...event,email:"bad"});
  assert.equal(out.ok,false);
  assert.equal(writes.length,0);
});
test("failed lookup blocks",async()=>{
  const {client,writes}=db({failFind:true});
  assert.equal((await applyProviderPreferenceWithdrawal(client,event)).ok,false);
  assert.equal(writes.length,0);
});
test("failed consent insert blocks subsequent CRM write",async()=>{
  const {client,writes}=db({failConsent:true});
  assert.equal((await applyProviderPreferenceWithdrawal(client,event)).ok,false);
  assert.equal(writes.length,1);
});
test("failed profile update reports retryable failure",async()=>{
  const {client}=db({failUpdate:true});
  const out=await applyProviderPreferenceWithdrawal(client,event);
  assert.deepEqual(out,{ok:false,reason:"profile_update_failed"});
});
