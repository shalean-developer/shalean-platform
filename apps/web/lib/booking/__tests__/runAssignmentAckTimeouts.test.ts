import { describe, expect, it, vi, beforeEach } from "vitest";
import { releaseAssignedBookingAfterAckTimeout } from "@/lib/booking/assignmentBookingStateCommands";
import { tryOnceReassignAfterDecline } from "@/lib/booking/reassignBookingAfterDecline";
import {
  runAssignmentAckTimeouts,
  shouldSkipAssignmentAckTimeout,
} from "@/lib/booking/runAssignmentAckTimeouts";
import { logSystemEvent } from "@/lib/logging/systemLog";

vi.mock("@/lib/booking/assignmentBookingStateCommands", () => ({
  releaseAssignedBookingAfterAckTimeout: vi.fn(),
}));

vi.mock("@/lib/booking/reassignBookingAfterDecline", () => ({
  tryOnceReassignAfterDecline: vi.fn(),
}));

vi.mock("@/lib/logging/systemLog", () => ({
  logSystemEvent: vi.fn(),
}));

describe("shouldSkipAssignmentAckTimeout", () => {
  it("skips team jobs", () => {
    expect(shouldSkipAssignmentAckTimeout({ is_team_job: true })).toBe(true);
  });

  it("skips monthly recurring user-selected continuity assigns", () => {
    expect(
      shouldSkipAssignmentAckTimeout({
        is_recurring_generated: true,
        is_monthly_billing_booking: true,
        assignment_type: "user_selected",
      }),
    ).toBe(true);
    expect(
      shouldSkipAssignmentAckTimeout({
        is_recurring_generated: true,
        billing_type: "recurring_invoice",
        assignment_type: "user_selected",
      }),
    ).toBe(true);
  });

  it("skips all recurring user-selected continuity assigns (including per-booking Paystack)", () => {
    expect(
      shouldSkipAssignmentAckTimeout({
        is_recurring_generated: true,
        is_monthly_billing_booking: false,
        assignment_type: "user_selected",
      }),
    ).toBe(true);
  });

  it("does not skip non-user-selected recurring or one-off checkout assigns", () => {
    expect(
      shouldSkipAssignmentAckTimeout({
        is_recurring_generated: true,
        is_monthly_billing_booking: true,
        assignment_type: "auto_dispatch",
      }),
    ).toBe(false);
    expect(shouldSkipAssignmentAckTimeout({ is_recurring_generated: false })).toBe(false);
  });
});

describe("runAssignmentAckTimeouts", () => {
  beforeEach(() => {
    vi.mocked(releaseAssignedBookingAfterAckTimeout).mockReset();
    vi.mocked(tryOnceReassignAfterDecline).mockReset();
    vi.mocked(logSystemEvent).mockReset();
    vi.mocked(releaseAssignedBookingAfterAckTimeout).mockResolvedValue({ data: { id: "x" }, error: null });
    vi.mocked(tryOnceReassignAfterDecline).mockResolvedValue(undefined);
    vi.mocked(logSystemEvent).mockResolvedValue(undefined);
  });

  it("does not release monthly recurring user-selected assigned bookings", async () => {
    const staleAssignedAt = new Date(Date.now() - 20 * 60 * 1000).toISOString();
    const admin = {
      from: (table: string) => {
        if (table === "notification_logs") {
          return {
            select: () => ({
              eq: () => ({
                gte: () => ({
                  order: () => ({
                    limit: async () => ({ data: [], error: null }),
                  }),
                }),
              }),
            }),
          };
        }
        return {
          select: () => ({
            eq: () => ({
              not: () => ({
                lt: () => ({
                  or: () => ({
                    limit: async () => ({
                    data: [
                      {
                        id: "rec-per-booking-1",
                        date: "2026-08-01",
                        time: "08:00",
                        cleaner_id: "cleaner-a",
                        assigned_at: staleAssignedAt,
                        is_team_job: false,
                        is_recurring_generated: true,
                        is_monthly_billing_booking: false,
                        billing_type: "per_booking",
                        assignment_type: "user_selected",
                      },
                      {
                        id: "rec-monthly-1",
                        date: "2026-08-15",
                        time: "09:00",
                        cleaner_id: "cleaner-c",
                        assigned_at: staleAssignedAt,
                        is_team_job: false,
                        is_recurring_generated: true,
                        is_monthly_billing_booking: true,
                        billing_type: "recurring_invoice",
                        assignment_type: "user_selected",
                      },
                      {
                        id: "checkout-1",
                        date: "2026-07-10",
                        time: "10:00",
                        cleaner_id: "cleaner-b",
                        assigned_at: staleAssignedAt,
                        is_team_job: false,
                        is_recurring_generated: false,
                        is_monthly_billing_booking: false,
                        billing_type: "per_booking",
                        assignment_type: "auto_dispatch",
                      },
                    ],
                    error: null,
                  }),
                }),
              }),
            }),
          }),
        }),
        };
      },
    };

    const result = await runAssignmentAckTimeouts(admin as never);

    expect(result.processed).toBe(1);
    expect(releaseAssignedBookingAfterAckTimeout).toHaveBeenCalledTimes(1);
    expect(releaseAssignedBookingAfterAckTimeout).toHaveBeenCalledWith(
      expect.objectContaining({ bookingId: "checkout-1" }),
    );
  });
});
