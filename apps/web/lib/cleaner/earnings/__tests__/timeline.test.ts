import { describe, expect, it } from "vitest";
import { describeBookingOperationalState } from "@/lib/booking/describeBookingOperationalState";
import { earningsRowOperationalBadge } from "@/lib/cleaner/earnings/timeline";
import type { CleanerEarningsRowWire } from "@/lib/cleaner/earnings/types";

function baseRow(overrides: Partial<CleanerEarningsRowWire> = {}): CleanerEarningsRowWire {
  return {
    booking_id: "bk1",
    date: "2026-05-10",
    completed_at: "2026-05-10T14:00:00.000Z",
    service: "Standard",
    location: "Somewhere",
    payout_status: "pending",
    payout_frozen_cents: 1000,
    amount_cents: 5000,
    payout_paid_at: null,
    payout_run_id: null,
    booking_status: "completed",
    ...overrides,
  };
}

describe("earningsRowOperationalBadge", () => {
  it("matches describeBookingOperationalState cleaner displayBadge and tone mapping", () => {
    const row = baseRow();
    const op = describeBookingOperationalState({
      row: {
        status: row.booking_status,
        completed_at: row.completed_at,
        admin_recurring_unpaid_completion_override_at: row.admin_recurring_unpaid_completion_override_at,
      },
      viewer: "cleaner",
    });
    const badge = earningsRowOperationalBadge(row);
    expect(badge.label).toBe(op.displayBadge);
    expect(badge.tone).toBe(op.displayTone === "success" ? "ok" : op.displayTone === "warning" || op.displayTone === "danger" ? "warn" : "muted");
  });

  it("shows Completed by admin override when override timestamp is present", () => {
    const row = baseRow({
      admin_recurring_unpaid_completion_override_at: "2026-05-10T15:00:00.000Z",
    });
    const badge = earningsRowOperationalBadge(row);
    expect(badge.label).toBe("Completed by admin override");
    expect(badge.tone).toBe("warn");
  });
});
