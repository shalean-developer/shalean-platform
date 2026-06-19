import { describe, expect, it } from "vitest";
import {
  computeOfficeNotificationAudienceCounts,
  computeOfficeNotificationChannelStats,
  computeOfficeNotificationLogPagination,
  computeOfficeNotificationTotals,
  mapOfficeNotificationRecentLog,
} from "@/lib/admin/officeNotifications";

describe("computeOfficeNotificationChannelStats", () => {
  it("aggregates sent and failed counts per channel", () => {
    const channels = computeOfficeNotificationChannelStats([
      { channel: "email", status: "sent" },
      { channel: "email", status: "failed" },
      { channel: "sms", status: "sent" },
      { channel: "whatsapp", status: "sent" },
    ]);
    const email = channels.find((c) => c.channel === "email");
    expect(email?.sent).toBe(1);
    expect(email?.failed).toBe(1);
    expect(email?.successRate).toBe(50);
  });
});

describe("computeOfficeNotificationTotals", () => {
  it("sums channel stats", () => {
    const totals = computeOfficeNotificationTotals([
      { channel: "email", label: "Email", sent: 2, failed: 1, successRate: 66.7 },
      { channel: "whatsapp", label: "WhatsApp", sent: 0, failed: 0, successRate: null },
      { channel: "sms", label: "SMS", sent: 1, failed: 0, successRate: 100 },
    ]);
    expect(totals.sent).toBe(3);
    expect(totals.failed).toBe(1);
    expect(totals.successRate).toBe(75);
  });
});

describe("computeOfficeNotificationAudienceCounts", () => {
  it("counts distinct customers and unassigned bookings today", () => {
    const audiences = computeOfficeNotificationAudienceCounts({
      customerEmailRows: [{ customer_email: "a@test.com" }, { customer_email: "a@test.com" }, { customer_email: "b@test.com" }],
      cleanerCount: 5,
      todayBookings: [
        { customer_email: "a@test.com", cleaner_id: null, selected_cleaner_id: null, team_id: null, status: "pending" },
        { customer_email: "b@test.com", cleaner_id: "c1", selected_cleaner_id: null, team_id: null, status: "assigned" },
        { customer_email: "c@test.com", cleaner_id: null, selected_cleaner_id: null, team_id: null, status: "cancelled" },
      ],
    });
    expect(audiences.allCustomers).toBe(2);
    expect(audiences.allCleaners).toBe(5);
    expect(audiences.bookingsToday).toBe(2);
    expect(audiences.unassignedToday).toBe(1);
  });
});

describe("computeOfficeNotificationLogPagination", () => {
  it("computes page metadata", () => {
    const meta = computeOfficeNotificationLogPagination({ limit: 10, offset: 10, total: 25, rowCount: 10 });
    expect(meta.page).toBe(2);
    expect(meta.totalPages).toBe(3);
    expect(meta.hasMore).toBe(true);
  });

  it("marks last page when no more rows", () => {
    const meta = computeOfficeNotificationLogPagination({ limit: 10, offset: 20, total: 25, rowCount: 5 });
    expect(meta.hasMore).toBe(false);
    expect(meta.page).toBe(3);
  });
});

describe("mapOfficeNotificationRecentLog", () => {
  it("maps log rows for UI display", () => {
    const row = mapOfficeNotificationRecentLog({
      id: "log-1",
      channel: "email",
      template_key: "booking_confirmed",
      status: "failed",
      recipient: "user@example.com",
      created_at: "2026-06-19T07:06:00.000Z",
    });
    expect(row.title).toBe("Booking confirmed");
    expect(row.canRetry).toBe(true);
    expect(row.statusTone).toBe("destructive");
  });
});
