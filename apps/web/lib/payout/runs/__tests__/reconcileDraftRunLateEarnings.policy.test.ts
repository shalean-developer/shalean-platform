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

  it("keeps general visit-edit sync out of run-linked payouts", () => {
    const sync = read("lib/payout/syncPayoutBatchFromBookings.ts");

    expect(sync).toContain("if (payoutRunId)");
    expect(sync).toContain("Payout is part of a disbursement run");
    expect(sync).not.toContain('admin.rpc("sync_draft_run_payout_total"');
    expect(sync).toContain('select("id, period_start, period_end, status, payout_run_id")');
    expect(sync).toContain("if (!id || !from || !to || runId) continue");
  });

  it("links frozen draft-run late earnings inside the database transaction", () => {
    const generator = read("lib/payout/generateWeeklyPayouts.ts");
    const migration = read(
      "../../supabase/migrations/20261009225500_master_03a_draft_run_late_earnings_atomic_sync.sql",
    );

    expect(generator).toContain('admin.rpc("append_draft_run_payout_earnings"');
    expect(migration).toContain("create or replace function public.append_draft_run_payout_earnings");
    expect(migration).toContain("update public.bookings");
    expect(migration).toContain("update public.booking_roster_member_payouts");
    expect(migration).toContain("update public.team_job_member_payouts");
    expect(migration).toContain("select distinct on (cleaner_id, booking_id)");
    expect(migration).toContain("grant execute on function public.append_draft_run_payout_earnings");
  });

  it("revalidates late-earning eligibility transactionally before linking", () => {
    const migration = read(
      "../../supabase/migrations/20261009225500_master_03a_draft_run_late_earnings_atomic_sync.sql",
    );

    expect(migration).toContain("lower(coalesce(b.status::text, '')) = 'completed'");
    expect(migration).toContain("coalesce(b.is_test, false) = false");
    expect(migration).toContain("b.refunded_at is null");
    expect(migration).toContain("payout_attribution_removal_v1");
    expect(migration).toContain("between v_period_start and v_period_end");
    expect(migration).toContain("monthly_invoices mi");
    expect(migration).toContain("b.payout_frozen_cents is not null");
    expect(migration).toContain("cleaner_earnings ce");
    expect(migration).toContain("greatest(coalesce(r.payout_cents, 0), 0)");
    expect(migration).toContain("where b.id = r.booking_id");
    expect(migration).toContain("and coalesce(b.cleaner_payout_cents, 0) > 0");
    expect(migration).toContain("greatest(coalesce(t.payout_cents, 0), 0) > 0");
  });

  it("chunks payout funding booking and invoice reads", () => {
    const src = read("lib/payout/payoutFunding.ts");
    expect(src).toContain("payoutQueryChunks");
    expect(src).toContain("for (const idChunk of payoutQueryChunks(bookingIds))");
    expect(src).toContain("for (const idChunk of payoutQueryChunks(uniqueInvoiceIds))");
  });

  it("rejects run-linked member payout edits before any mutation", () => {
    const src = read("lib/payout/adjustBookingTeamMemberPayoutEarnings.ts");

    expect(src).toContain("explicitMemberPayoutIds");
    expect(src).toContain('select("id, status, payout_run_id")');
    expect(src).toContain('code: "payout_run_locked"');
    expect(src.indexOf("explicitMemberPayoutIds")).toBeLessThan(src.indexOf("const previousTotalCents"));
    expect(src).toContain('select("id, period_start, period_end, payout_run_id")');
    expect(src).toContain("return !runId && from && to");
  });

  it("makes member payout edits atomic with payout reconciliation", () => {
    const adjust = read("lib/payout/adjustBookingTeamMemberPayoutEarnings.ts");
    const migration = read(
      "../../supabase/migrations/20261009225500_master_03a_draft_run_late_earnings_atomic_sync.sql",
    );

    expect(adjust).toContain('admin.rpc(\n      "adjust_unrun_member_payout_earnings"');
    expect(adjust).toContain("p_booking_patch: patch");
    expect(adjust).toContain("p_direct_payout_id: editable.payoutId");
    expect(adjust).toContain("if (!hasTj && !hasRosterPay && Object.keys(patch).length > 0)");
    expect(migration).toContain("create or replace function public.adjust_unrun_member_payout_earnings");
    expect(migration).toContain("p_booking_patch jsonb");
    expect(migration).toContain("p_direct_payout_id uuid");
    expect(migration).toContain("for update");
    expect(migration).toContain("p.payout_run_id is null");
    expect(migration).toContain("update public.team_job_member_payouts");
    expect(migration).toContain("update public.booking_roster_member_payouts");
    expect(migration).toContain("update public.bookings b");
    expect(migration).toContain("p_booking_patch ? 'earnings_summary'");
    expect(migration).toContain("update public.cleaner_payouts");
    expect(migration).toContain("grant execute on function public.adjust_unrun_member_payout_earnings");
  });

  it("keeps draft-run total recomputation paginated and draft-only", () => {
    const src = read("lib/payout/runs/reconcileDraftRunLateEarnings.ts");
    expect(src).toContain("fetchAllPayoutRows");
    expect(src).toContain('.eq("status", "draft")');
    expect(src).not.toContain("payout_run_id: null");
    expect(src).not.toContain('status: "pending"');
  });
});
