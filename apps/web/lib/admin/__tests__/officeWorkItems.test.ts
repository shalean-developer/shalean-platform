import { describe, expect, it } from "vitest";
import {
  canReceiveOfficeWorkItem,
  isKnownOfficeWorkItemType,
  sortOfficeWorkItems,
  type OfficeWorkItem,
} from "@/lib/admin/officeWorkItems";

const bookingItem: OfficeWorkItem = {
  id: "booking.assignment:1",
  type: "booking.assignment",
  title: "Booking needs team allocation",
  summary: "Booking 1 is not assigned.",
  priority: "high",
  status: "open",
  href: "/office/bookings/1",
  actionLabel: "Assign team",
  requiredPermission: "booking.assign",
  occurredAt: null,
  dueAt: "2026-08-04T06:00:00+02:00",
  branchId: null,
  teamId: null,
};

const applicationItem: OfficeWorkItem = {
  id: "workforce.application:1",
  type: "workforce.application",
  title: "Cleaner application needs review",
  summary: "Cape Town",
  priority: "medium",
  status: "open",
  href: "/office/cleaner-applications?application=1",
  actionLabel: "Review application",
  requiredPermission: "application.decide",
  occurredAt: "2026-08-07T10:00:00Z",
  dueAt: "2026-08-09T10:00:00Z",
  branchId: null,
  teamId: null,
};

describe("Office work item policy", () => {
  it("fails closed for unknown workflow types", () => {
    expect(isKnownOfficeWorkItemType("booking.assignment")).toBe(true);
    expect(isKnownOfficeWorkItemType("workforce.application")).toBe(true);
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

  it("requires application.decide for cleaner application work", () => {
    expect(canReceiveOfficeWorkItem(applicationItem, new Set(["application.decide"]))).toBe(true);
    expect(canReceiveOfficeWorkItem(applicationItem, new Set(["cleaner.view"]))).toBe(false);
    expect(
      canReceiveOfficeWorkItem(
        { ...applicationItem, href: "/office/cleaners" },
        new Set(["application.decide"]),
      ),
    ).toBe(false);
  });

  it("sorts critical and overdue work first", () => {
    const items: OfficeWorkItem[] = [
      bookingItem,
      { ...bookingItem, id: "low", priority: "low", dueAt: null },
      { ...bookingItem, id: "critical", priority: "critical", status: "overdue" },
    ];
    expect(sortOfficeWorkItems(items).map((item) => item.id)).toEqual(["critical", bookingItem.id, "low"]);
  });
});
