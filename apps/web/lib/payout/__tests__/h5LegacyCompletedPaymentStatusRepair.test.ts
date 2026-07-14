import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { readRepositoryMigration } from "@/lib/audit/resolveRepositoryMigration";
import {
  bookingPayableForWeeklyBatch,
  type BookingRowForWeeklyBatchEligibility,
} from "@/lib/payout/bookingPayableForWeeklyBatch";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../../../..");
const { sql } = readRepositoryMigration(
  "20260937_h5_legacy_completed_payment_status_repair.sql",
);
const sqlLower = sql.toLowerCase();

/**
 * Production Readiness Audit H-5 — repair migration content guards.
 *
 * The migration heals legacy completed bookings whose `payment_status` is
 * NULL despite valid payment evidence, so weekly cleaner payouts can resume.
 * It must be:
 *   1. idempotent (`payment_status IS NULL` filter is a self-disabling guard);
 *   2. limited to prepaid completed rows with positive payout basis and
 *      multi-signal payment evidence;
 *   3. forbidden from touching monthly invoice rows or refunded rows;
 *   4. unable to violate `bookings_paid_requires_amount` or
 *      `bookings_paid_requires_timestamp` invariants.
 */
describe("H-5 repair migration: 20260937_h5_legacy_completed_payment_status_repair.sql", () => {
  it("targets only `status='completed'` AND `payment_status IS NULL`", () => {
    expect(sqlLower).toMatch(/status\s*=\s*'completed'/);
    expect(sqlLower).toMatch(/payment_status\s+is\s+null/);
  });

  it("requires positive cleaner_payout_cents (no payout, no repair)", () => {
    expect(sqlLower).toMatch(/coalesce\(cleaner_payout_cents,\s*0\)\s*>\s*0/);
  });

  it("excludes test fixtures", () => {
    expect(sqlLower).toMatch(/coalesce\(is_test,\s*false\)\s*=\s*false/);
  });

  it("hard-excludes every monthly invoice path", () => {
    expect(sqlLower).toMatch(/coalesce\(is_monthly_billing_booking,\s*false\)\s*=\s*false/);
    expect(sqlLower).toMatch(/monthly_invoice_id\s+is\s+null/);
    expect(sqlLower).toMatch(/'recurring_invoice'/);
    expect(sqlLower).toMatch(/'monthly_contract'/);
  });

  it("excludes refunded / reversed rows", () => {
    expect(sqlLower).toMatch(/refunded_at\s+is\s+null/);
    for (const term of ["refunded", "full", "partial", "chargeback", "reversed", "failed_after_success"]) {
      expect(sqlLower).toContain(`'${term}'`);
    }
  });

  it("requires positive amount_paid_cents to satisfy bookings_paid_requires_amount", () => {
    expect(sqlLower).toMatch(/coalesce\(amount_paid_cents,\s*0\)\s*>\s*0/);
  });

  it("requires ≥ 1 additional independent payment-evidence signal beyond amount_paid_cents", () => {
    expect(sqlLower).toMatch(/payment_completed_at\s+is\s+not\s+null/);
    expect(sqlLower).toMatch(/paid_at\s+is\s+not\s+null/);
    expect(sqlLower).toMatch(/coalesce\(total_paid_cents,\s*0\)\s*>\s*0/);
    expect(sqlLower).toMatch(/coalesce\(total_paid_zar,\s*0\)\s*>\s*0/);
    expect(sqlLower).toMatch(/paystack_reference\s+is\s+not\s+null/);
    expect(sqlLower).toMatch(/marked_paid_by_admin_id\s+is\s+not\s+null/);
    expect(sqlLower).toMatch(/>=\s*1/);
  });

  it("only writes payment_status='success' (no other state mutations beyond timestamp + updated_at)", () => {
    const updateClause = sql.match(/update\s+public\.bookings\s+b\s+set\b([\s\S]*?)from\s+h5_repair_candidates/i);
    expect(updateClause).not.toBeNull();
    const body = (updateClause?.[1] ?? "").toLowerCase();
    expect(body).toMatch(/payment_status\s*=\s*'success'/);
    expect(body).toMatch(/payment_completed_at\s*=/);
    expect(body).toMatch(/updated_at\s*=\s*now\(\)/);
    expect(body).not.toMatch(/payout_status/);
    expect(body).not.toMatch(/payout_frozen_cents/);
    expect(body).not.toMatch(/cleaner_payout_cents/);
    expect(body).not.toMatch(/cleaner_id/);
    expect(body).not.toMatch(/\bstatus\s*=/);
  });

  it("synthesises payment_completed_at via coalesce(payment_completed_at, paid_at, completed_at)", () => {
    expect(sqlLower).toMatch(
      /coalesce\(\s*payment_completed_at\s*,\s*paid_at\s*,\s*completed_at\s*\)/,
    );
  });

  it("guards against null synthetic timestamp (defence-in-depth)", () => {
    expect(sqlLower).toMatch(
      /coalesce\(\s*payment_completed_at\s*,\s*paid_at\s*,\s*completed_at\s*\)\s+is\s+not\s+null/,
    );
  });

  it("contains no unrelated DDL or destructive statements (comment-stripped)", () => {
    // Strip line comments + block comments so doc-text references like
    // 'cleaner_payouts batch' do not produce false negatives.
    const code = sqlLower
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .replace(/--[^\n]*/g, " ");
    expect(code).not.toMatch(/\bdrop\s+/);
    expect(code).not.toMatch(/\balter\s+/);
    expect(code).not.toMatch(/\bdelete\s+from/);
    expect(code).not.toMatch(/\binsert\s+into/);
    expect(code).not.toMatch(/\bfrom\s+public\.cleaner_payouts/);
    expect(code).not.toMatch(/\bfrom\s+public\.cleaner_earnings/);
    expect(code).not.toMatch(/\bfrom\s+public\.dispatch_offers/);
    expect(code).not.toMatch(/\bupdate\s+public\.cleaner_payouts/);
    expect(code).not.toMatch(/\bupdate\s+public\.cleaner_earnings/);
    expect(code).not.toMatch(/\bupdate\s+public\.dispatch_offers/);
    // The only writable target must be public.bookings.
    const updateTargets = Array.from(code.matchAll(/update\s+(\S+)\s/g)).map((m) => m[1]);
    for (const target of updateTargets) {
      expect(target).toBe("public.bookings");
    }
  });
});

/**
 * Behavioural test: a row matching the H-5 repair shape becomes payable for
 * the weekly batch as soon as its `payment_status` is healed to 'success'.
 */
describe("H-5 weekly-batch eligibility resumes after repair", () => {
  const drifted: BookingRowForWeeklyBatchEligibility = {
    status: "completed",
    billing_type: "prepaid",
    is_monthly_billing_booking: false,
    monthly_invoice_id: null,
    cleaner_payout_cents: 35000,
    amount_paid_cents: 90000,
    total_paid_zar: 900,
    payment_status: null,
  };

  it("BEFORE repair: drifted row is NOT payable (silently excluded)", () => {
    const result = bookingPayableForWeeklyBatch(drifted, new Map());
    expect(result.payable).toBe(false);
    if (!result.payable) {
      expect(result.reason).toBe("prepaid_customer_payment_not_settled");
    }
  });

  it("AFTER repair: same row with payment_status='success' IS payable", () => {
    const repaired: BookingRowForWeeklyBatchEligibility = { ...drifted, payment_status: "success" };
    const result = bookingPayableForWeeklyBatch(repaired, new Map());
    expect(result.payable).toBe(true);
  });

  it("REJECTED-by-repair row (cleaner_payout_cents=0) stays NOT payable even after promotion to success", () => {
    const noPayoutBasis: BookingRowForWeeklyBatchEligibility = {
      ...drifted,
      cleaner_payout_cents: 0,
      payment_status: "success",
    };
    const result = bookingPayableForWeeklyBatch(noPayoutBasis, new Map());
    expect(result.payable).toBe(false);
    if (!result.payable) {
      expect(result.reason).toBe("missing_cleaner_payout_basis");
    }
  });

  it("monthly-billing row with payment_status=null is NOT eligible for the H-5 prepaid repair (different rail)", () => {
    const monthly: BookingRowForWeeklyBatchEligibility = {
      ...drifted,
      billing_type: "recurring_invoice",
      is_monthly_billing_booking: true,
      monthly_invoice_id: "11111111-1111-4111-8111-111111111111",
    };
    const result = bookingPayableForWeeklyBatch(monthly, new Map());
    expect(result.payable).toBe(false);
    if (!result.payable) {
      expect(result.reason).toMatch(/monthly|accrual/);
    }
  });

  it("refund-blocked row with synthetic payment_status='success' STILL NOT payable", () => {
    const refunded: BookingRowForWeeklyBatchEligibility = {
      ...drifted,
      payment_status: "success",
      refunded_at: "2026-04-29T12:00:00Z",
    };
    const result = bookingPayableForWeeklyBatch(refunded, new Map());
    expect(result.payable).toBe(false);
    if (!result.payable) {
      expect(result.reason).toBe("refund_or_reversal_blocked");
    }
  });
});
