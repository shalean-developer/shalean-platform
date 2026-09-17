import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("customer referral completion contract", () => {
  it("promises and defaults to a completed-booking reward", () => {
    const settings = read("lib/referrals/settings.ts");
    const home = read("components/marketing-home/sections/MarketingHomeReferralSection.tsx");
    const sections = read("components/marketing-home/MarketingHomeDbSections.tsx");
    expect(settings).toContain('rewardOn: "first_completed_booking"');
    expect(home).toContain('href="/refer"');
    expect(home).toContain("first cleaning is completed and fully paid");
    expect(sections).toContain("<MarketingHomeReferralSection />");
  });

  it("awards credit and referral status in one restricted transaction", () => {
    const server = read("lib/referrals/server.ts");
    const migration = read("../../supabase/migrations/20260917110000_referral_completion_rewards.sql");
    expect(server).toContain('"award_customer_referral_credit"');
    expect(server).not.toContain("creditCleaningCredit({");
    expect(migration).toContain("for update;");
    expect(migration).toContain("public.apply_cleaning_credit_transaction(");
    expect(migration).toContain("status = 'rewarded'");
    expect(migration).toContain("security invoker");
    expect(migration).toContain("from public, anon, authenticated");
    expect(migration).toContain("to service_role");
  });
});
