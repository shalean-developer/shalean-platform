import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "../../supabase/migrations/20260812075100_p0_02a_lock_high_risk_security_definer_rpcs.sql",
);

const sql = readFileSync(migrationPath, "utf8").toLowerCase();

const protectedNames = [
  "admin_billing_switch_finalize",
  "admin_mark_payout_paid",
  "apply_cleaning_credit_transaction",
  "approve_cleaner_change_request",
  "assign_team_and_sync_roster",
  "claim_cleaner_earnings_for_paystack",
  "invoke_nextjs_cron",
  "mark_bookings_paid_for_earnings_disbursement",
  "monthly_invoice_hard_close",
  "purge_stale_pending_payment_bookings",
  "repair_empty_team_booking_rosters",
  "replace_booking_cleaners_admin_atomic",
  "replace_booking_line_items_atomic",
  "resolve_admin_monthly_booking_race",
  "resolve_auth_user_id_by_email",
  "retry_unassigned_jobs",
  "run_dispatch_cycle",
  "sync_booking_cleaners_for_team_booking",
];

describe("P0-02 SECURITY DEFINER RPC hardening contract", () => {
  it("contains every high-risk RPC in the protected service-role-only set", () => {
    for (const name of protectedNames) {
      expect(sql).toContain(`'${name}'`);
    }
  });

  it("revokes PUBLIC, anon and authenticated then grants service_role", () => {
    expect(sql).toContain("revoke all on function %s from public");
    expect(sql).toContain("revoke all on function %s from anon");
    expect(sql).toContain("revoke all on function %s from authenticated");
    expect(sql).toContain("grant execute on function %s to service_role");
  });

  it("only targets SECURITY DEFINER functions in public schema", () => {
    expect(sql).toContain("n.nspname = 'public'");
    expect(sql).toContain("p.prosecdef is true");
  });
});
