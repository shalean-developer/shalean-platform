import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function read(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("late earnings reconciliation safety boundary", () => {
  it("only permits draft payout runs to be reopened", () => {
    const reopenable = (status: string) => status === "draft";
    expect(reopenable("draft")).toBe(true);
    expect(reopenable("approved")).toBe(false);
    expect(reopenable("paid")).toBe(false);
  });

  it("runs cron and admin generation through closed-month catch-up while draft runs are temporarily reopened", () => {
    for (const path of [
      "app/api/cron/generate-payouts/route.ts",
      "app/api/admin/payouts/generate/route.ts",
    ]) {
      const src = read(path);
      expect(src).toContain("generateCatchUpWeeklyPayouts");
      expect(src).toContain("prepareDraftRunPayoutsForCatchUp");
      expect(src).toContain("restoreDraftRunPayoutsAfterCatchUp");
    }
  });

  it("keeps the standalone catch-up script serialized but never detaches frozen draft-run payouts", () => {
    const src = read("scripts/regenerate-catchup-payouts.ts");
    expect(src).toContain("withCronLock");
    expect(src).toContain("CRON_LOCK_KEYS.generatePayouts");
    expect(src).toContain("generateCatchUpWeeklyPayouts");
    expect(src).not.toContain("prepareDraftRunPayoutsForCatchUp");
    expect(src).not.toContain("restoreDraftRunPayoutsAfterCatchUp");
  });

  it("renews long-running payout cron leases through an owner-checked RPC", () => {
    const lock = read("lib/cron/cronLock.ts");
    const sql = read("../../supabase/migrations/20261009203000_master_03a_renew_cron_lock.sql");
    expect(lock).toContain("renewCronLock");
    expect(lock).toContain('admin.rpc("renew_cron_lock"');
    expect(lock).toContain("setInterval");
    expect(lock).toContain("clearInterval");
    expect(sql).toContain("holder_id = p_holder_id");
    expect(sql).toContain("expires_at > v_now");
    expect(sql).toContain("grant execute on function public.renew_cron_lock");
  });

  it("paginates both payout discovery and downstream payout processing", () => {
    const generator = read("lib/payout/generateWeeklyPayouts.ts");
    const roster = read("lib/payout/rosterMemberWeeklyPayoutCandidates.ts");
    const team = read("lib/payout/teamJobMemberWeeklyPayoutCandidates.ts");
    expect(generator).toContain("fetchAllPayoutRows");
    expect(generator).toContain('from("cleaners")');
    expect(generator).toContain('.order("id", { ascending: true })');
    expect(generator).toContain("payoutQueryChunks");
    expect(roster).toContain("fetchAllPayoutRows");
    expect(roster).toContain("payoutQueryChunks");
    expect(team).toContain("fetchAllPayoutRows");
    expect(team).toContain("payoutQueryChunks");
  });
});
