import { describe, expect, it } from "vitest";
import {
  canReceiveOfficeWorkItem,
  groupOfficeWorkItems,
  humanizeCronJobName,
  isKnownOfficeWorkItemType,
  looksLikeRawJson,
  sortOfficeWorkItems,
  splitWorkItemDescription,
  type OfficeWorkItem,
} from "@/lib/admin/officeWorkItems";

const bookingItem: OfficeWorkItem = {
  id: "booking.assignment:1",
  type: "booking.assignment",
  title: "Booking needs team allocation",
  summary: "Booking 1 is not assigned.",
  priority: "high",
  severity: "high",
  status: "open",
  category: "operational",
  businessImpact: "Unallocated booking blocks cleaner dispatch.",
  href: "/office/bookings/1",
  actionLabel: "Assign team",
  requiredPermission: "booking.assign",
  occurredAt: null,
  dueAt: "2026-08-04T06:00:00+02:00",
  lastSuccessAt: null,
  affectedRecordCount: 1,
  technicalDetails: null,
  branchId: null,
  teamId: null,
};

const cronItem: OfficeWorkItem = {
  id: "system.cron:charge-monthly-invoices",
  type: "system.cron",
  title: "Monthly invoice scheduler failed",
  summary: "Monthly invoice scheduler reported an error on its last run.",
  priority: "critical",
  severity: "critical",
  status: "blocked",
  category: "system_health",
  businessImpact: "Monthly invoice billing may stall.",
  href: "/office/ops-health",
  actionLabel: "Review system health",
  requiredPermission: "ops.health.view",
  occurredAt: "2026-08-06T08:00:00+02:00",
  dueAt: null,
  lastSuccessAt: "2026-08-05T08:00:00+02:00",
  affectedRecordCount: null,
  technicalDetails: '{"error":"timeout"}',
  branchId: null,
  teamId: null,
};

describe("Office work item policy", () => {
  it("fails closed for unknown workflow types", () => {
    expect(isKnownOfficeWorkItemType("booking.assignment")).toBe(true);
    expect(isKnownOfficeWorkItemType("finance.secret")).toBe(false);
  });

  it("requires the registry permission and safe destination", () => {
    expect(canReceiveOfficeWorkItem(bookingItem, new Set(["booking.assign"]))).toBe(true);
    expect(canReceiveOfficeWorkItem(bookingItem, new Set(["booking.view"]))).toBe(false);
    expect(canReceiveOfficeWorkItem({ ...bookingItem, href: "/office/security" }, new Set(["booking.assign"]))).toBe(false);
  });

  it("prevents Supervisors without booking.assign from receiving allocation work", () => {
    const supervisorPermissions = new Set(["booking.view", "team.view", "cleaner.view"]);
    expect(canReceiveOfficeWorkItem(bookingItem, supervisorPermissions)).toBe(false);
  });

  it("sorts critical and overdue work first", () => {
    const items: OfficeWorkItem[] = [
      bookingItem,
      { ...bookingItem, id: "low", priority: "low", severity: "low", dueAt: null },
      { ...bookingItem, id: "critical", priority: "critical", severity: "critical", status: "overdue" },
    ];
    expect(sortOfficeWorkItems(items).map((item) => item.id)).toEqual(["critical", bookingItem.id, "low"]);
  });

  it("groups operational and system-health items correctly", () => {
    const grouped = groupOfficeWorkItems([bookingItem, cronItem]);
    expect(grouped.operational.map((item) => item.id)).toEqual([bookingItem.id]);
    expect(grouped.systemHealth.map((item) => item.id)).toEqual([cronItem.id]);
  });

  it("does not use raw JSON as the primary work-item description", () => {
    expect(looksLikeRawJson('{"error":"timeout"}')).toBe(true);
    const split = splitWorkItemDescription('{"error":"timeout"}', "Human fallback summary");
    expect(split.summary).toBe("Human fallback summary");
    expect(split.technicalDetails).toBe('{"error":"timeout"}');
    expect(cronItem.summary).not.toMatch(/^\{/);
    expect(cronItem.technicalDetails).toMatch(/^\{/);
  });

  it("humanizes known cron job names", () => {
    expect(humanizeCronJobName("charge-monthly-invoices")).toBe("Monthly invoice scheduler");
    expect(humanizeCronJobName("payout-integrity-daily")).toBe("Payout integrity check");
    expect(humanizeCronJobName("generate-recurring-bookings")).toBe("Recurring booking generation");
  });
});
