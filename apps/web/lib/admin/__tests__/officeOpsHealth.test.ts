import { describe, expect, it } from "vitest";
import {
  barsFromDailyCounts,
  buildOfficeOpsHealthSummary,
  formatOfficeOpsRelativeTime,
  lastJohannesburgYmds,
  statusFromUptimeBars,
  uptimePctFromBars,
} from "@/lib/admin/officeOpsHealth";

describe("barsFromDailyCounts", () => {
  it("maps counts to uptime bars", () => {
    const bars = barsFromDailyCounts(
      ["2026-06-17", "2026-06-18", "2026-06-19"],
      new Map([
        ["2026-06-17", 0],
        ["2026-06-18", 2],
        ["2026-06-19", 6],
      ]),
      { warn: 1, down: 5 },
    );
    expect(bars).toEqual(["ok", "warn", "down"]);
    expect(uptimePctFromBars(bars)).toBe(33.3);
  });
});

describe("statusFromUptimeBars", () => {
  it("maps bar mix to status", () => {
    expect(statusFromUptimeBars(["ok", "ok", "ok"])).toBe("operational");
    expect(statusFromUptimeBars(["ok", "warn", "ok"])).toBe("degraded");
    expect(statusFromUptimeBars(Array.from({ length: 10 }, () => "down"))).toBe("down");
  });
});

describe("buildOfficeOpsHealthSummary", () => {
  it("marks database down when probe fails", () => {
    const summary = buildOfficeOpsHealthSummary({
      fetchedAt: "2026-06-19T10:00:00.000Z",
      productionHealth: {
        ok: true,
        generatedAt: "2026-06-19T10:00:00.000Z",
        scanLimit: 100,
        findings: [],
        totals: { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
      },
      dbLatencyMs: null,
      dbOk: false,
      systemErrorRows: [],
      cronErrorRows: [],
      notificationRows: [],
      whatsappPausedUntil: null,
      notificationsQueryOk: true,
    });
    const db = summary.services.find((service) => service.id === "database");
    expect(db?.currentStatus).toBe("down");
    expect(db?.status).toBe("down");
    expect(summary.allOperational).toBe(false);
  });

  it("splits current and 30d notification status when only history is bad", () => {
    const summary = buildOfficeOpsHealthSummary({
      fetchedAt: "2026-06-19T10:00:00.000Z",
      productionHealth: null,
      dbLatencyMs: 20,
      dbOk: true,
      systemErrorRows: [],
      cronErrorRows: [],
      notificationRows: [
        ...Array.from({ length: 5 }, (_, i) => ({
          created_at: new Date(Date.parse("2026-06-19T10:00:00.000Z") - (i + 5) * 86_400_000).toISOString(),
          status: "failed",
        })),
        { created_at: "2026-06-19T09:10:00.000Z", status: "sent" },
        { created_at: "2026-06-19T09:15:00.000Z", status: "sent" },
      ],
      whatsappPausedUntil: null,
      notificationsQueryOk: true,
    });
    const notifications = summary.services.find((service) => service.id === "notifications");
    expect(notifications?.currentStatus).toBe("operational");
    expect(notifications?.periodStatus).not.toBe("operational");
  });

  it("marks website 30d degraded while current stays operational without recent errors", () => {
    const summary = buildOfficeOpsHealthSummary({
      fetchedAt: "2026-06-19T10:00:00.000Z",
      productionHealth: null,
      dbLatencyMs: 20,
      dbOk: true,
      systemErrorRows: Array.from({ length: 12 }, (_, i) => ({
        created_at: new Date(Date.parse("2026-06-19T10:00:00.000Z") - (i + 2) * 86_400_000).toISOString(),
      })),
      cronErrorRows: [],
      notificationRows: [],
      whatsappPausedUntil: null,
      notificationsQueryOk: true,
    });
    const website = summary.services.find((service) => service.id === "website");
    expect(website?.currentStatus).toBe("operational");
    expect(website?.periodStatus).not.toBe("operational");
  });
});

describe("lastJohannesburgYmds", () => {
  it("returns consecutive days", () => {
    const days = lastJohannesburgYmds(3, new Date("2026-06-19T10:00:00+02:00"));
    expect(days).toHaveLength(3);
    expect(days[2]).toBe("2026-06-19");
  });
});

describe("formatOfficeOpsRelativeTime", () => {
  it("formats recent timestamps", () => {
    expect(formatOfficeOpsRelativeTime(new Date().toISOString())).toBe("Just now");
  });
});
