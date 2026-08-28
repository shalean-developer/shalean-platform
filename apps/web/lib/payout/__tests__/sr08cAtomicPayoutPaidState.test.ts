import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = path.resolve(
  process.cwd(),
  "../../supabase/migrations/20260828170000_sr_08c_atomic_payout_paid_state.sql",
);
const migrationSql = fs.readFileSync(migrationPath, "utf8").toLowerCase();

const manualReleasePath = path.resolve(process.cwd(), "lib/payout/markPayoutPaid.ts");
const manualReleaseSource = fs.readFileSync(manualReleasePath, "utf8");

describe("SR-08C atomic payout paid-state convergence", () => {
  it("converges weekly payout parent and all linked earning rails in the parent transaction", () => {
    expect(migrationSql).toContain("create trigger cleaner_payout_paid_children_sync");
    expect(migrationSql).toContain("after update of status on public.cleaner_payouts");
    expect(migrationSql).toContain("update public.bookings b");
    expect(migrationSql).toContain("update public.booking_roster_member_payouts rp");
    expect(migrationSql).toContain("update public.team_job_member_payouts tj");
  });

  it("converges earnings disbursement parent, earnings rows, and linked bookings together", () => {
    expect(migrationSql).toContain("create trigger cleaner_earnings_disbursement_paid_children_sync");
    expect(migrationSql).toContain("after update of status on public.cleaner_earnings_disbursements");
    expect(migrationSql).toContain("update public.cleaner_earnings ce");
    expect(migrationSql).toMatch(/update public\.bookings b[\s\S]*from public\.cleaner_earnings ce/);
  });

  it("keeps the trigger functions service-role only", () => {
    expect(migrationSql).toContain("revoke all on function public.sync_cleaner_payout_paid_children() from authenticated");
    expect(migrationSql).toContain("grant execute on function public.sync_cleaner_payout_paid_children() to service_role");
    expect(migrationSql).toContain("revoke all on function public.sync_cleaner_earnings_disbursement_paid_children() from authenticated");
    expect(migrationSql).toContain("grant execute on function public.sync_cleaner_earnings_disbursement_paid_children() to service_role");
  });

  it("does not perform a second fallible booking-sync RPC after manual parent release", () => {
    expect(manualReleaseSource).not.toContain('admin.rpc("mark_bookings_paid_for_cleaner_payout"');
    expect(manualReleaseSource).toContain('.update({ status: "paid", paid_at: new Date().toISOString(), payment_status: "success" })');
  });
});
