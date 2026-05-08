import { describe, expect, it } from "vitest";
import { classifyAdminBookingListRow } from "@/lib/admin/adminBookingListClassify";

const today = "2026-05-10";

function row(
  p: Partial<{
    status: string | null;
    date: string | null;
    completed_at: string | null;
    cleaner_response_status: string | null;
    en_route_at: string | null;
    started_at: string | null;
    dispatch_status: string | null;
    is_recurring_generated: boolean | null;
    billing_type: string | null;
    monthly_invoice_id: string | null;
  }>,
) {
  return {
    status: "pending" as string | null,
    date: "2026-05-12" as string | null,
    completed_at: null as string | null,
    cleaner_response_status: null as string | null,
    en_route_at: null as string | null,
    started_at: null as string | null,
    dispatch_status: null as string | null,
    is_recurring_generated: null as boolean | null,
    billing_type: null as string | null,
    monthly_invoice_id: null as string | null,
    ...p,
  };
}

describe("classifyAdminBookingListRow", () => {
  it("buckets authoritative completion when status lags", () => {
    expect(
      classifyAdminBookingListRow(
        row({ status: "in_progress", completed_at: "2026-05-09T10:00:00.000Z", date: "2026-05-09" }),
        today,
      ),
    ).toBe("completed");
  });

  it("treats payment_expired as completed bucket", () => {
    expect(classifyAdminBookingListRow(row({ status: "payment_expired", date: "2026-05-12" }), today)).toBe("completed");
  });

  it("uses date for active assigned job", () => {
    expect(classifyAdminBookingListRow(row({ status: "assigned", date: today }), today)).toBe("today");
    expect(classifyAdminBookingListRow(row({ status: "assigned", date: "2026-05-15" }), today)).toBe("upcoming");
    expect(classifyAdminBookingListRow(row({ status: "assigned", date: "2026-05-01" }), today)).toBe("completed");
  });

  it("buckets cancelled as completed regardless of future date", () => {
    expect(classifyAdminBookingListRow(row({ status: "cancelled", date: "2026-06-01" }), today)).toBe("completed");
  });
});
