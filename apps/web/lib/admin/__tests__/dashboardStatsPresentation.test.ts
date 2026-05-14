import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ADMIN_DASHBOARD_CONVERSION_SOURCE_LABEL,
  ADMIN_DASHBOARD_REVENUE_SCOPE_LABEL,
  dashboardFetchedAtLabel,
  dashboardStaleBadgeTone,
  notificationMetricDetail,
  notificationMetricHeadline,
} from "@/lib/admin/dashboardStatsPresentation";

describe("dashboardStatsPresentation", () => {
  it("does not show zero notification counts when notification data is unavailable", () => {
    expect(
      notificationMetricHeadline({
        available: false,
        error: "permission denied",
        email: { sent: 0, failed: 0 },
        whatsapp: { sent: 0, failed: 0 },
        sms: { sent: 0, failed: 0 },
        whatsappSuccessRatePct: null,
      }),
    ).toBe("Data unavailable");
    expect(notificationMetricDetail({ available: false, error: "permission denied" })).toContain("permission denied");
  });

  it("uses accepted and failed wording for notification labels", () => {
    const label = notificationMetricHeadline({
      email: { sent: 2, failed: 1 },
      whatsapp: { sent: 3, failed: 2 },
      sms: { sent: 4, failed: 1 },
      whatsappSuccessRatePct: 60,
    });

    expect(label).toContain("Email 2 accepted");
    expect(label).toContain("1 failed");
    expect(label).toContain("WhatsApp 3/5 accepted");
    expect(label).toContain("SMS 4 accepted");
    expect(label).not.toContain(" ok");
    expect(label).not.toContain(" sent");
  });

  it("formats fetchedAt freshness and stale state", () => {
    const now = new Date("2026-05-14T10:10:00.000Z").getTime();

    expect(dashboardFetchedAtLabel("2026-05-14T10:09:30.000Z", now)).toBe("Fetched just now");
    expect(dashboardFetchedAtLabel("2026-05-14T10:05:00.000Z", now)).toBe("Fetched 5m ago");
    expect(dashboardStaleBadgeTone("2026-05-14T10:09:30.000Z", now)).toBe("fresh");
    expect(dashboardStaleBadgeTone("2026-05-14T10:04:59.000Z", now)).toBe("stale");
  });

  it("exposes revenue scope and conversion source copy for the dashboard", () => {
    expect(ADMIN_DASHBOARD_REVENUE_SCOPE_LABEL).toContain("monthly invoice collections excluded");
    expect(ADMIN_DASHBOARD_CONVERSION_SOURCE_LABEL).toContain("booking_events");
    expect(ADMIN_DASHBOARD_CONVERSION_SOURCE_LABEL).toContain("selected user_events");
  });

  it("dashboard stats API includes fetchedAt", () => {
    const src = readFileSync(join(process.cwd(), "app/api/admin/dashboard-stats/route.ts"), "utf8");
    expect(src).toContain("const fetchedAt = new Date().toISOString()");
    expect(src).toContain("fetchedAt,");
  });
});
