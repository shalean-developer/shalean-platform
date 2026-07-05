import { describe, expect, it } from "vitest";
import {
  evaluatePersistCleanerPayoutEligibility,
  explainPersistCleanerPayoutEligibility,
  isPayoutEligibilitySkipReason,
} from "@/lib/payout/bookingPayoutPersistEligibility";

describe("bookingPayoutPersistEligibility", () => {
  it("allows paid solo assignment basis (pre-completion)", () => {
    const r = evaluatePersistCleanerPayoutEligibility({
      status: "assigned",
      completed_at: null,
      is_team_job: false,
      billing_type: "per_booking",
      total_paid_zar: 500,
      total_paid_cents: 50_000,
      amount_paid_cents: 50_000,
      payment_needs_follow_up: false,
    });
    expect(r).toEqual({ allowed: true, mode: "pre_completion_assignment_basis" });
  });

  it("allows completed regardless of dispatch noise", () => {
    const r = evaluatePersistCleanerPayoutEligibility({
      status: "completed",
      completed_at: "2026-06-01T10:00:00Z",
      dispatch_status: "searching",
      cleaner_id: "00000000-0000-4000-8000-000000000001",
      is_team_job: false,
      total_paid_zar: 100,
      total_paid_cents: 10_000,
      amount_paid_cents: 10_000,
    });
    expect(r).toEqual({ allowed: true, mode: "completed" });
  });

  it("blocks terminal bookings", () => {
    expect(evaluatePersistCleanerPayoutEligibility({ status: "cancelled" }).allowed).toBe(false);
    expect(evaluatePersistCleanerPayoutEligibility({ status: "failed" }).allowed).toBe(false);
    expect(evaluatePersistCleanerPayoutEligibility({ status: "payment_expired" }).allowed).toBe(false);
  });

  it("blocks payment_needs_follow_up for standard per_booking when not yet on-site", () => {
    const r = evaluatePersistCleanerPayoutEligibility({
      status: "pending",
      completed_at: null,
      payment_needs_follow_up: true,
      billing_type: "per_booking",
      cleaner_id: "00000000-0000-4000-8000-000000000001",
    });
    expect(r.allowed).toBe(false);
    if (!r.allowed) expect(r.skipReason).toBe("payout_eligibility_payment_follow_up");
  });

  it("allows payment_needs_follow_up when invoice-backed", () => {
    const r = evaluatePersistCleanerPayoutEligibility({
      status: "completed",
      completed_at: "2026-06-01T10:00:00Z",
      payment_needs_follow_up: true,
      billing_type: "recurring_invoice",
      is_team_job: false,
      cleaner_id: "00000000-0000-4000-8000-000000000001",
      total_paid_zar: 100,
    });
    expect(r).toEqual({ allowed: true, mode: "completed" });
  });

  it("blocks dispatch funnel booking statuses before completion", () => {
    const r = evaluatePersistCleanerPayoutEligibility({
      status: "pending_assignment",
      completed_at: null,
      is_team_job: false,
      total_paid_zar: 500,
      total_paid_cents: 50_000,
      amount_paid_cents: 50_000,
    });
    expect(r.allowed).toBe(false);
    if (!r.allowed) expect(r.skipReason).toBe("payout_eligibility_dispatch_booking_status");
  });

  it("allows in_progress without paid columns (preview/completion persist path)", () => {
    const r = evaluatePersistCleanerPayoutEligibility({
      status: "in_progress",
      completed_at: null,
      is_team_job: false,
      billing_type: "per_booking",
      payment_status: null,
      total_paid_cents: null,
      amount_paid_cents: null,
    });
    expect(r).toEqual({ allowed: true, mode: "pre_completion_assignment_basis" });
  });

  it("allows in_progress even when payment_needs_follow_up is set (active job completion path)", () => {
    const r = evaluatePersistCleanerPayoutEligibility({
      status: "in_progress",
      completed_at: null,
      is_team_job: false,
      billing_type: "per_booking",
      payment_needs_follow_up: true,
      total_paid_zar: 400,
      total_paid_cents: 40_000,
    });
    expect(r).toEqual({ allowed: true, mode: "pre_completion_assignment_basis" });
  });

  it("allows recurring_invoice solo without completed status", () => {
    const r = evaluatePersistCleanerPayoutEligibility({
      status: "",
      billing_type: "recurring_invoice",
      is_monthly_billing_booking: true,
      is_team_job: false,
      cleaner_id: "c1",
      total_paid_zar: 500,
      amount_paid_cents: 0,
      payment_status: "pending_monthly",
    });
    expect(r).toEqual({ allowed: true, mode: "pre_completion_assignment_basis" });
  });

  it("isPayoutEligibilitySkipReason detects contract skips", () => {
    expect(isPayoutEligibilitySkipReason("payout_eligibility_terminal_booking")).toBe(true);
    expect(isPayoutEligibilitySkipReason("display_earnings_already_set")).toBe(false);
  });

  it("explain wraps evaluate", () => {
    const x = explainPersistCleanerPayoutEligibility({ status: "failed" });
    expect(x.summary.startsWith("blocked:")).toBe(true);
  });
});
