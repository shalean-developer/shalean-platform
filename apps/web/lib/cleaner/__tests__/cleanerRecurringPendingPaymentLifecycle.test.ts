import { describe, expect, it } from "vitest";
import {
  bookingIsRecurringPendingPayment,
  recurringPendingPaymentLifecycleAllowsAction,
} from "@/lib/cleaner/cleanerRecurringPendingPaymentLifecycle";
import { deriveCleanerJobUiState, mobilePhaseDisplayForDashboard } from "@/lib/cleaner/cleanerMobileBookingMap";
import type { CleanerBookingRow } from "@/lib/cleaner/cleanerBookingRow";

function row(partial: Record<string, unknown>): Record<string, unknown> {
  return partial;
}

describe("recurringPendingPaymentLifecycleAllowsAction", () => {
  it("blocks progression for recurring pending_payment", () => {
    const r = row({ status: "pending_payment", is_recurring_generated: true });
    expect(recurringPendingPaymentLifecycleAllowsAction("complete", r)).toEqual({
      allowed: false,
      reason: "recurring_pending_payment_progression",
    });
    expect(recurringPendingPaymentLifecycleAllowsAction("en_route", r)).toEqual({
      allowed: false,
      reason: "recurring_pending_payment_progression",
    });
    expect(recurringPendingPaymentLifecycleAllowsAction("start", r)).toEqual({
      allowed: false,
      reason: "recurring_pending_payment_progression",
    });
  });

  it("allows accept and reject for recurring pending_payment", () => {
    const r = row({ status: "pending_payment", billing_type: "monthly_contract" });
    expect(recurringPendingPaymentLifecycleAllowsAction("accept", r)).toEqual({ allowed: true });
    expect(recurringPendingPaymentLifecycleAllowsAction("reject", r)).toEqual({ allowed: true });
  });

  it("blocks all actions for one-time pending_payment", () => {
    const r = row({ status: "pending_payment", billing_type: "prepaid" });
    expect(recurringPendingPaymentLifecycleAllowsAction("accept", r)).toEqual({
      allowed: false,
      reason: "one_time_pending_payment",
    });
  });

  it("bookingIsRecurringPendingPayment matches visibility signals", () => {
    expect(bookingIsRecurringPendingPayment(row({ status: "pending_payment", monthly_invoice_id: "x" }))).toBe(true);
    expect(bookingIsRecurringPendingPayment(row({ status: "pending_payment", billing_type: "prepaid" }))).toBe(false);
  });
});

describe("deriveCleanerJobUiState recurring pending_payment", () => {
  const base = (): CleanerBookingRow => ({
    id: "1",
    service: "Clean",
    date: "2099-06-01",
    time: "10:00",
    location: "Somewhere",
    status: "pending_payment",
    total_paid_zar: null,
    customer_name: "A",
    customer_phone: null,
    assigned_at: null,
    en_route_at: null,
    started_at: null,
    completed_at: null,
    created_at: null,
    is_recurring_generated: true,
    billing_type: "prepaid",
    cleaner_response_status: "pending",
    accepted_at: null,
  });

  it("shows accept when not yet accepted", () => {
    expect(deriveCleanerJobUiState(base())).toEqual({ phase: "accept", canReject: true });
  });

  it("hides travel/start/complete after accept", () => {
    expect(
      deriveCleanerJobUiState({
        ...base(),
        cleaner_response_status: "accepted",
        accepted_at: "2099-05-01T10:00:00.000Z",
      }),
    ).toEqual({ phase: "none" });
  });
});

describe("mobilePhaseDisplayForDashboard recurring pending accepted", () => {
  it("shows invoice approval line when accepted and invoice-backed", () => {
    const r = {
      id: "1",
      status: "pending_payment",
      billing_type: "recurring_invoice",
      cleaner_response_status: "accepted",
      accepted_at: "2099-05-01",
      date: "2099-06-01",
      time: "10:00",
      location: null,
      total_paid_zar: null,
      customer_name: null,
      customer_phone: null,
      assigned_at: null,
      en_route_at: null,
      started_at: null,
      completed_at: null,
      created_at: null,
    } as unknown as CleanerBookingRow;
    expect(mobilePhaseDisplayForDashboard(r)).toBe("Awaiting invoice approval");
  });
});
