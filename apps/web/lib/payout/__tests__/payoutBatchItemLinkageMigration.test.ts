import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = path.resolve(
  process.cwd(),
  "../../supabase/migrations/20260731173000_payout_batch_item_linkage.sql",
);
const sql = fs.readFileSync(migrationPath, "utf8").toLowerCase();

describe("payout batch item linkage migration", () => {
  it("adds and indexes the exact team-member batch foreign key", () => {
    expect(sql).toMatch(/alter table public\.team_job_member_payouts[\s\S]*add column if not exists cleaner_payout_id uuid/);
    expect(sql).toContain("team_job_member_payouts_cleaner_payout_id_fkey");
    expect(sql).toContain("team_job_member_payouts_cleaner_payout_id_idx");
  });

  it("backfills legacy batched team rows without touching paid transfers", () => {
    expect(sql).toMatch(/update public\.team_job_member_payouts tj[\s\S]*tj\.status = 'batched'/);
    expect(sql).toMatch(/tj\.cleaner_payout_id is null/);
  });

  it("marks direct, roster, and team earning rails paid idempotently", () => {
    expect(sql).toContain("update public.bookings b");
    expect(sql).toContain("update public.booking_roster_member_payouts rp");
    expect(sql).toContain("update public.team_job_member_payouts tj");
    expect(sql).toContain("grant execute on function public.mark_bookings_paid_for_cleaner_payout(uuid) to service_role");
  });

  it("freezes before creating the Monday disbursement run", () => {
    expect(sql).toContain("set schedule = '0 7 * * 1' where jobname = 'freeze-payouts'");
    expect(sql).toContain("set schedule = '0 8 * * 1' where jobname = 'create-payout-run'");
  });
});
