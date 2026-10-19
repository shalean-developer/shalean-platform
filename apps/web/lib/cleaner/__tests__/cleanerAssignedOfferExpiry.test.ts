import { describe, expect, it } from "vitest";
import { ASSIGNED_ACCEPT_GRACE_MS, assignedOfferPastAcceptanceDeadline, recurringAssignmentAcceptanceOverdue } from "@/lib/cleaner/cleanerAssignedOfferExpiry";
import type { CleanerBookingRow } from "@/lib/cleaner/cleanerBookingRow";

function row(
  over: Partial<CleanerBookingRow>,
): Parameters<typeof assignedOfferPastAcceptanceDeadline>[0] {
  return {
    status: "assigned",
    cleaner_response_status: "pending",
    date: "2026-04-30",
    time: "09:00",
    accepted_at: null,
    is_team_job: false,
    ...over,
  };
}

describe("assignedOfferPastAcceptanceDeadline", () => {
  it("is false before start + grace", () => {
    const startMs = Date.parse("2026-04-30T07:00:00.000Z");
    const nowMs = startMs + ASSIGNED_ACCEPT_GRACE_MS - 60_000;
    expect(assignedOfferPastAcceptanceDeadline(row({}), nowMs)).toBe(false);
  });

  it("is true after start + grace when still not accepted", () => {
    const startMs = Date.parse("2026-04-30T07:00:00.000Z");
    const nowMs = startMs + ASSIGNED_ACCEPT_GRACE_MS + 60_000;
    expect(assignedOfferPastAcceptanceDeadline(row({}), nowMs)).toBe(true);
  });

  it("is false for team jobs after start + grace (roster visibility must not drop)", () => {
    const startMs = Date.parse("2026-04-30T07:00:00.000Z");
    const nowMs = startMs + ASSIGNED_ACCEPT_GRACE_MS + 60_000;
    expect(assignedOfferPastAcceptanceDeadline(row({ is_team_job: true }), nowMs)).toBe(false);
  });

  it("is false once accepted", () => {
    const nowMs = Date.now();
    expect(assignedOfferPastAcceptanceDeadline(row({ cleaner_response_status: "accepted" }), nowMs)).toBe(false);
  });

  it("is false when accepted_at is set even if cleaner_response_status lags", () => {
    const startMs = Date.parse("2026-04-30T07:00:00.000Z");
    const nowMs = startMs + ASSIGNED_ACCEPT_GRACE_MS + 60_000;
    expect(
      assignedOfferPastAcceptanceDeadline(
        row({ cleaner_response_status: "pending", accepted_at: "2026-04-30T06:00:00.000Z" }),
        nowMs,
      ),
    ).toBe(false);
  });

  it("is false for non-assigned status", () => {
    const nowMs = Date.parse("2099-01-01T00:00:00.000Z");
    expect(assignedOfferPastAcceptanceDeadline(row({ status: "in_progress" }), nowMs)).toBe(false);
  });

  it("matches assigned for legacy confirmed rows", () => {
    const startMs = Date.parse("2026-04-30T07:00:00.000Z");
    const nowMs = startMs + ASSIGNED_ACCEPT_GRACE_MS + 60_000;
    expect(assignedOfferPastAcceptanceDeadline(row({ status: "confirmed" }), nowMs)).toBe(true);
  });

  it("is false when date cannot be parsed to start", () => {
    const nowMs = Date.parse("2099-01-01T00:00:00.000Z");
    expect(assignedOfferPastAcceptanceDeadline(row({ date: "not-a-date" }), nowMs)).toBe(false);
  });
});

describe("overdue recurring assignment visibility", () => {
  const late = Date.parse("2026-04-30T08:45:00Z");
  const recurringSignals = [
    { is_recurring_generated: true },
    { billing_type: "recurring_invoice" },
    { billing_type: "monthly_contract" },
    { monthly_invoice_id: "invoice-fixture" },
  ];

  it.each(recurringSignals)("keeps an unaccepted recurring assignment visible with %j", (signal) => {
    const booking = row(signal);
    expect(assignedOfferPastAcceptanceDeadline(booking, late)).toBe(false);
    expect(recurringAssignmentAcceptanceOverdue(booking, late)).toBe(true);
    expect(booking.cleaner_response_status).toBe("pending");
    expect(booking.accepted_at).toBeNull();
  });

  it("warns only after the existing grace period, in Johannesburg time", () => {
    const booking = row({ is_recurring_generated: true });
    const deadline = Date.parse("2026-04-30T07:30:00Z");
    expect(recurringAssignmentAcceptanceOverdue(booking, deadline)).toBe(false);
    expect(recurringAssignmentAcceptanceOverdue(booking, deadline + 1)).toBe(true);
  });

  it.each(["accepted", "on_my_way", "started", "completed"])("clears the warning after %s", (response) => {
    expect(recurringAssignmentAcceptanceOverdue(row({ is_recurring_generated: true, cleaner_response_status: response }), late)).toBe(false);
  });

  it("respects persisted acceptance when the response column lags", () => {
    expect(recurringAssignmentAcceptanceOverdue(row({ is_recurring_generated: true, accepted_at: "2026-04-30T08:00:00Z" }), late)).toBe(false);
  });

  it.each(["cancelled", "completed", "failed", "payment_expired", "in_progress"])("does not warn for %s jobs", (status) => {
    expect(recurringAssignmentAcceptanceOverdue(row({ is_recurring_generated: true, status }), late)).toBe(false);
  });

  it("does not warn for an expired one-off or an invalid schedule", () => {
    expect(recurringAssignmentAcceptanceOverdue(row({}), late)).toBe(false);
    expect(recurringAssignmentAcceptanceOverdue(row({ is_recurring_generated: true, date: "invalid" }), late)).toBe(false);
  });
});
