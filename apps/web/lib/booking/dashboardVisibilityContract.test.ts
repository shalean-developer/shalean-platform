import { describe, expect, it } from "vitest";
import {
  describeAdminBookingsRouteScope,
  explainCleanerJobsListPostFilter,
  explainCustomerDashboardVisibility,
} from "@/lib/booking/dashboardVisibilityContract";

describe("dashboardVisibilityContract", () => {
  describe("explainCustomerDashboardVisibility", () => {
    it("shows pending_payment for owner so payment recovery stays reachable", () => {
      const r = explainCustomerDashboardVisibility(
        { status: "pending_payment", user_id: "u1", customer_email: null },
        "u1",
        "",
      );
      expect(r.visible).toBe(true);
      expect(r.reason).toContain("pending_payment_recovery");
    });

    it("hides payment_expired", () => {
      expect(
        explainCustomerDashboardVisibility({ status: "payment_expired", user_id: "u1" }, "u1", "").visible,
      ).toBe(false);
    });

    it("shows paid pending for owner", () => {
      const r = explainCustomerDashboardVisibility({ status: "pending", user_id: "u1" }, "u1", "");
      expect(r.visible).toBe(true);
    });

    it("shows completed for owner", () => {
      expect(explainCustomerDashboardVisibility({ status: "completed", user_id: "u1" }, "u1", "").visible).toBe(true);
    });

    it("allows email orphan when user_id null and email matches", () => {
      const r = explainCustomerDashboardVisibility(
        { status: "pending_assignment", user_id: null, customer_email: "customer@example.com" },
        "other-user-id",
        "customer@example.com",
      );
      expect(r.visible).toBe(true);
    });

    it("blocks when user_id belongs to another account", () => {
      const r = explainCustomerDashboardVisibility(
        { status: "pending", user_id: "owner-1", customer_email: "same@example.com" },
        "intruder",
        "same@example.com",
      );
      expect(r.visible).toBe(false);
    });
  });

  describe("explainCleanerJobsListPostFilter", () => {
    it("passes normal pending job", () => {
      expect(explainCleanerJobsListPostFilter({ status: "pending" }).visible).toBe(true);
    });

    it("hides failed", () => {
      expect(explainCleanerJobsListPostFilter({ status: "failed" }).visible).toBe(false);
    });

    it("hides one-shot pending_payment", () => {
      expect(
        explainCleanerJobsListPostFilter({
          status: "pending_payment",
          is_recurring_generated: false,
          billing_type: "per_booking",
        }).visible,
      ).toBe(false);
    });

    it("allows recurring pending_payment when signals present", () => {
      expect(
        explainCleanerJobsListPostFilter({
          status: "pending_payment",
          is_recurring_generated: true,
        }).visible,
      ).toBe(true);
    });
  });

  describe("describeAdminBookingsRouteScope", () => {
    it("reports SLA narrowing", () => {
      const m = describeAdminBookingsRouteScope({
        filter: "sla",
        bookingStatus: "all",
        recurringScoped: false,
      });
      expect(m.scope).toBe("server_narrowed");
      expect(m.detail).toContain("pending");
    });

    it("reports broad fetch by default", () => {
      const m = describeAdminBookingsRouteScope({
        filter: "all",
        bookingStatus: "all",
        recurringScoped: false,
      });
      expect(m.scope).toBe("broad_recent");
    });
  });
});
