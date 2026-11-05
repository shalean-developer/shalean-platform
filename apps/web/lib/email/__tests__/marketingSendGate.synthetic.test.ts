import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

const provider = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock("@/lib/email/readResendMarketingState", () => ({
  readResendMarketingState: provider.read,
}));
import { checkMarketingSendGate } from "../marketingSendGate";

const customerId = "00000000-0000-4000-8000-000000000777";
const email = "synthetic@example.test";
const validProvider = { verified: true, unsubscribed: false, suppressed: false };
type Row = { data: Record<string, unknown> | null; error: {message:string} | null };
function data(rows: { profile?: Row; consent?: Row; suppression?: Row } = {}): SupabaseClient {
  const defaults = {
    profile: { data: {id:customerId,role:"customer",billing_email:email,marketing_emails_unsubscribed_at:null}, error:null },
    consent: { data: {decision:"granted"}, error:null },
    suppression: {data:null,error:null},
  };
  const results: Record<string,Row> = {
    user_profiles: rows.profile ?? defaults.profile,
    marketing_email_consent_events: rows.consent ?? defaults.consent,
    email_suppressions: rows.suppression ?? defaults.suppression,
  };
  return {from(table:string) {
    const chain: Record<string,unknown> = {};
    for(const k of ["eq","order","limit"]) chain[k]=()=>chain;
    chain.maybeSingle=async()=>results[table];
    return {select:()=>chain};
  }} as unknown as SupabaseClient;
}
describe("synthetic marketing send gate — no email sent", () => {
  beforeEach(() => {
    provider.read.mockReset();
    provider.read.mockResolvedValue(validProvider);
  });
  it("allows only verified affirmative consent with no suppressions", async () => {
    expect(await checkMarketingSendGate(data(),customerId,email)).toEqual({allowed:true});
  });
  it("rejects missing consent", async () => {
    const result=await checkMarketingSendGate(data({consent:{data:null,error:null}}),customerId,email);
    expect(result).toEqual({allowed:false,reason:"no_affirmative_consent"});
  });
  it("rejects consent lookup errors", async () => {
    const result=await checkMarketingSendGate(data({consent:{data:null,error:{message:"database down"}}}),customerId,email);
    expect(result).toEqual({allowed:false,reason:"eligibility_lookup_failed"});
  });
  it("rejects mismatched customer email", async () => {
    const result=await checkMarketingSendGate(data(),customerId,"different@example.test");
    expect(result).toMatchObject({allowed:false,reason:"unverified_customer"});
  });
  it("rejects missing customer identity", async () => {
    const result=await checkMarketingSendGate(data(),null,email);
    expect(result).toMatchObject({allowed:false,reason:"unverified_customer"});
  });
  it("rejects explicit CRM marketing opt-out", async () => {
    const profile={data:{id:customerId,role:"customer",billing_email:email,marketing_emails_unsubscribed_at:"2026-11-04T00:00:00Z"},error:null};
    const result=await checkMarketingSendGate(data({profile}),customerId,email);
    expect(result).toEqual({allowed:false,reason:"unsubscribed"});
  });
  it("rejects local suppression", async () => {
    const result=await checkMarketingSendGate(data({suppression:{data:{email},error:null}}),customerId,email);
    expect(result).toEqual({allowed:false,reason:"suppressed"});
  });
  it("rejects provider unsubscribe", async () => {
    provider.read.mockResolvedValue({...validProvider,unsubscribed:true});
    const result=await checkMarketingSendGate(data(),customerId,email);
    expect(result).toEqual({allowed:false,reason:"unsubscribed"});
  });
  it("rejects provider suppression", async () => {
    provider.read.mockResolvedValue({...validProvider,suppressed:true});
    const result=await checkMarketingSendGate(data(),customerId,email);
    expect(result).toEqual({allowed:false,reason:"suppressed"});
  });
  it("rejects provider lookup uncertainty", async () => {
    provider.read.mockResolvedValue({verified:false,unsubscribed:null,suppressed:null});
    const result=await checkMarketingSendGate(data(),customerId,email);
    expect(result).toEqual({allowed:false,reason:"unverified_preferences"});
  });
});
