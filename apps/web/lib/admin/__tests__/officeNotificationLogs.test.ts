import { describe, expect, it } from "vitest";
import {
  buildOfficeNotificationLogsListResponse,
  computeOfficeNotificationLogsSummary,
  notificationLogSearchPattern,
  sanitizeNotificationLogSearch,
} from "@/lib/admin/officeNotificationLogs";

describe("sanitizeNotificationLogSearch", () => {
  it("strips wildcard characters", () => {
    expect(sanitizeNotificationLogSearch("  foo%bar_ ")).toBe("foobar");
  });
});

describe("notificationLogSearchPattern", () => {
  it("wraps sanitized search in ilike pattern", () => {
    expect(notificationLogSearchPattern("sarah")).toBe("%sarah%");
    expect(notificationLogSearchPattern("   ")).toBeNull();
  });
});

describe("computeOfficeNotificationLogsSummary", () => {
  it("computes success rate from sent and failed", () => {
    expect(computeOfficeNotificationLogsSummary({ total: 10, sent: 8, failed: 2 }).successRate).toBe(80);
  });
});

describe("buildOfficeNotificationLogsListResponse", () => {
  it("includes pagination metadata", () => {
    const res = buildOfficeNotificationLogsListResponse({
      logs: [{ id: "1", booking_id: null, channel: "email", template_key: "t", recipient: "a", status: "sent", error: null, provider: null, role: null, event_type: null, created_at: "2026-01-01" }],
      limit: 20,
      offset: 0,
      total: 45,
      sent: 40,
      failed: 5,
    });
    expect(res.pagination.totalPages).toBe(3);
    expect(res.hasMore).toBe(true);
    expect(res.summary.total).toBe(45);
  });
});
