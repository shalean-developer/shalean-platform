import { describe, expect, it } from "vitest";

import { assertAdminBookingDeleteSafe } from "@/lib/admin/adminBookingDeleteSafety";

describe("assertAdminBookingDeleteSafe", () => {
  it("allows hard delete only for financially unlinked unpaid bookings", () => {
    expect(
      assertAdminBookingDeleteSafe({
        status: "payment_expired",
        payment_status: "pending",
        amount_paid_cents: 0,
      }),
    ).toEqual({ ok: true });
  });

  it("blocks hard delete when the booking belongs to a sales-document invoice", () => {
    const result = assertAdminBookingDeleteSafe({
      status: "payment_expired",
      payment_status: "pending",
      amount_paid_cents: 0,
      sales_document_id: "11111111-1111-4111-8111-111111111111",
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected sales-document booking delete to be blocked");
    expect(result.code).toBe("admin_booking_delete_sales_document_child");
    expect(result.blocks).toContainEqual({
      code: "admin_booking_delete_sales_document_child",
      message:
        "Sales-document invoice-backed bookings cannot be hard-deleted. Cancel or expire the booking so the invoice linkage remains auditable.",
    });
  });

  it("continues to block monthly-invoice children", () => {
    const result = assertAdminBookingDeleteSafe({
      status: "payment_expired",
      payment_status: "pending_monthly",
      amount_paid_cents: 0,
      monthly_invoice_id: "22222222-2222-4222-8222-222222222222",
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected monthly invoice booking delete to be blocked");
    expect(result.blocks.some((block) => block.code === "admin_booking_delete_monthly_invoice_child")).toBe(true);
  });
});
