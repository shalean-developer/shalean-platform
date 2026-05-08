import { describe, expect, it } from "vitest";
import {
  bookingMatchesRecurringCleanerPendingPayment,
  cleanerJobsListRowPostFilter,
  cleanerPendingPaymentBannerForRow,
} from "@/lib/cleaner/cleanerBookingAccess";
import { getNextUpcomingMobileJob, mobilePhaseDisplayForDashboard } from "@/lib/cleaner/cleanerMobileBookingMap";
import type { CleanerBookingRow } from "@/lib/cleaner/cleanerBookingRow";

function row(partial: Record<string, unknown>): Record<string, unknown> {
  return partial;
}

describe("cleanerJobsListRowPostFilter", () => {
  it("hides failed and payment_expired", () => {
    expect(cleanerJobsListRowPostFilter(row({ status: "failed" }))).toBe(false);
    expect(cleanerJobsListRowPostFilter(row({ status: "payment_expired" }))).toBe(false);
  });

  it("hides one-time pending_payment", () => {
    expect(
      cleanerJobsListRowPostFilter(
        row({ status: "pending_payment", is_recurring_generated: false, billing_type: "prepaid", monthly_invoice_id: null }),
      ),
    ).toBe(false);
  });

  it("shows recurring pending_payment when is_recurring_generated", () => {
    expect(cleanerJobsListRowPostFilter(row({ status: "pending_payment", is_recurring_generated: true }))).toBe(true);
  });

  it("shows recurring pending_payment for invoice billing_type", () => {
    expect(
      cleanerJobsListRowPostFilter(row({ status: "pending_payment", billing_type: "recurring_invoice" })),
    ).toBe(true);
    expect(
      cleanerJobsListRowPostFilter(row({ status: "pending_payment", billing_type: "monthly_contract" })),
    ).toBe(true);
  });

  it("shows recurring pending_payment when monthly_invoice_id set", () => {
    expect(
      cleanerJobsListRowPostFilter(row({ status: "pending_payment", monthly_invoice_id: "inv-1" })),
    ).toBe(true);
  });
});

describe("bookingMatchesRecurringCleanerPendingPayment", () => {
  it("is false when not pending_payment", () => {
    expect(bookingMatchesRecurringCleanerPendingPayment(row({ status: "assigned", is_recurring_generated: true }))).toBe(
      false,
    );
  });
});

describe("cleanerPendingPaymentBannerForRow", () => {
  it("returns null for non-recurring pending_payment", () => {
    expect(cleanerPendingPaymentBannerForRow(row({ status: "pending_payment", billing_type: "prepaid" }))).toBe(null);
  });

  it("returns invoice copy for recurring_invoice", () => {
    expect(
      cleanerPendingPaymentBannerForRow(row({ status: "pending_payment", billing_type: "recurring_invoice" })),
    ).toBe("Recurring invoice pending");
  });
});

describe("getNextUpcomingMobileJob", () => {
  it("includes recurring pending_payment in next-up candidates", () => {
    const future = "2099-01-15";
    const rows = [
      {
        id: "a",
        status: "pending_payment",
        is_recurring_generated: true,
        date: future,
        time: "09:00",
        location: "X",
        total_paid_zar: null,
        customer_name: "C",
        customer_phone: null,
        assigned_at: null,
        en_route_at: null,
        started_at: null,
        completed_at: null,
        created_at: null,
      },
    ] as unknown as CleanerBookingRow[];
    const next = getNextUpcomingMobileJob(rows, new Date("2099-01-10T12:00:00Z"));
    expect(next?.id).toBe("a");
  });

  it("excludes non-recurring pending_payment from next-up", () => {
    const future = "2099-01-15";
    const rows = [
      {
        id: "b",
        status: "pending_payment",
        billing_type: "prepaid",
        date: future,
        time: "09:00",
        location: "X",
        total_paid_zar: null,
        customer_name: "C",
        customer_phone: null,
        assigned_at: null,
        en_route_at: null,
        started_at: null,
        completed_at: null,
        created_at: null,
      },
    ] as unknown as CleanerBookingRow[];
    expect(getNextUpcomingMobileJob(rows, new Date("2099-01-10T12:00:00Z"))).toBe(null);
  });
});

describe("mobilePhaseDisplayForDashboard", () => {
  it("uses payment banner for recurring pending_payment", () => {
    const r = {
      id: "1",
      status: "pending_payment",
      billing_type: "monthly_contract",
      date: null,
      time: null,
      location: null,
      total_paid_zar: null,
      customer_name: null,
      customer_phone: null,
      assigned_at: null,
      en_route_at: null,
      started_at: null,
      completed_at: null,
      created_at: null,
    } as unknown as CleanerBookingRow;
    expect(mobilePhaseDisplayForDashboard(r)).toBe("Recurring invoice pending");
  });
});
