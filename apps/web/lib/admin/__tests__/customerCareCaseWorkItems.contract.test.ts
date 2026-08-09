import { describe, expect, it } from "vitest";
import { canReceiveOfficeWorkItem, OFFICE_WORK_ITEM_POLICIES } from "@/lib/admin/officeWorkItems";

describe("Customer Care case My Work policy", () => {
  it("requires customer.contact and the customer-care Office route", () => {
    expect(OFFICE_WORK_ITEM_POLICIES["customer_care.case"]).toEqual({
      permission: "customer.contact",
      hrefPrefix: "/office/customer-care",
    });

    const item = {
      type: "customer_care.case" as const,
      requiredPermission: "customer.contact" as const,
      href: "/office/customer-care?case=case-1",
    };

    expect(canReceiveOfficeWorkItem(item, new Set(["customer.contact"]))).toBe(true);
    expect(canReceiveOfficeWorkItem(item, new Set(["booking.view"]))).toBe(false);
  });
});
