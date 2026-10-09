import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function read(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("MASTER-03A late earnings reconciliation safety boundary", () => {
  it("routes cron and admin generation through closed-month catch-up without detaching draft-run payouts", () => {
    for (const path of [
      "app/api/cron/generate-payouts/route.ts",
      "app/api/admin/payouts/generate/route.ts",
    ]) {
      const src = read(path);
      expect(src).toContain("generateCatchUpWeeklyPayouts");
      expect(src).not.toContain("prepareDraftRunPayoutsForCatchUp");
      expect(src).not.toContain("restoreDraftRunPayoutsAfterCatchUp");
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

  it("allows late earnings only on pending batches or frozen batches whose parent run is still draft", () => {
    const src = read("lib/payout/generateWeeklyPayouts.ts");
    expect(src).toContain('existingStatus === "pending" && !existingRunId');
    expect(src).toContain('existingStatus === "frozen"');
    expect(src).toContain('existingRunStatus === "draft"');
    expect(src).toContain("syncPayoutBatchFromBookings");
    expect(src).toContain("Eligible earnings found after the monthly payout batch was locked");
  });

  it("paginates discovery, downstream processing, and post-link payout total loading", () => {
    const generator = read("lib/payout/generateWeeklyPayouts.ts");
    const roster = read("lib/payout/rosterMemberWeeklyPayoutCandidates.ts");
    const team = read("lib/payout/teamJobMemberWeeklyPayoutCandidates.ts");
    const batchItems = read("lib/payout/loadCleanerPayoutBatchItems.ts");

    expect(generator).toContain("fetchAllPayoutRows");
    expect(generator).toContain('from("cleaners")');
    expect(generator).toContain('.order("id", { ascending: true })');
    expect(generator).toContain("payoutQueryChunks");
    expect(roster).toContain("fetchAllPayoutRows");
    expect(roster).toContain("payoutQueryChunks");
    expect(team).toContain("fetchAllPayoutRows");
    expect(team).toContain("payoutQueryChunks");
    expect(batchItems).toContain("fetchAllPayoutRows");
    expect(batchItems).toContain("payoutQueryChunks");
  });

  it("reconciles a partially linked batch before surfacing a chunk failure", () => {
    const src = read("lib/payout/generateWeeklyPayouts.ts");
    expect(src).toContain("syncAndAbortAfterPartialLinkFailure");
    expect(src).toContain("partial batch reconciliation failed");
    expect(src).toContain("rollbackNewLinks");
    expect(src).toContain("new links rolled back");
    expect(src).toContain("throw new Error(reason)");
  });

  it("uses the service-role atomic sync for frozen payouts attached to draft runs", () => {
    const sync = read("lib/payout/syncPayoutBatchFromBookings.ts");
    const migration = read(
      "../../supabase/migrations/20261009225500_master_03a_draft_run_late_earnings_atomic_sync.sql",
    );

    expect(sync).toContain('status === "frozen" && payoutRunId');
    expect(sync).toContain('admin.rpc("sync_draft_run_payout_total"');
    expect(migration).toContain("security definer");
    expect(migration).toContain("auth.role() <> 'service_role'");
    expect(migration).toContain("v_run_status <> 'draft'");
    expect(migration).toContain("and draft_run");
    expect(migration).toContain("grant execute on function public.sync_draft_run_payout_total");
  });

  it("keeps draft-run total recomputation paginated and draft-only", () => {
    const src = read("lib/payout/runs/reconcileDraftRunLateEarnings.ts");
    expect(src).toContain("fetchAllPayoutRows");
    expect(src).toContain('.eq("status", "draft")');
    expect(src).not.toContain("payout_run_id: null");
    expect(src).not.toContain('status: "pending"');
  });
});
