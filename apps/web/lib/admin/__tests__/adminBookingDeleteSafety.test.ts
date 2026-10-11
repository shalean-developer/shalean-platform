import { describe, expect, it } from "vitest";

import { assertAdminBookingDeleteSafe } from "@/lib/admin/adminBookingDeleteSafety";

describe("assertAdminBookingDeleteSafe", () => {
  it("allows hard delete for an unpaid financially-unlinked expired booking", () => {
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
  it("blocks hard delete when a durable payment transaction link survives", () => {
    const result = assertAdminBookingDeleteSafe({
      status: "cancelled",
      payment_status: "pending",
      amount_paid_cents: 0,
      total_paid_cents: 0,
      total_paid_zar: 0,
      payment_transaction_id: "33333333-3333-4333-8333-333333333333",
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected payment-linked booking delete to be blocked");
    expect(result.blocks.some((block) => block.code === "admin_booking_delete_payment_transaction_linked")).toBe(true);
  });

  it("blocks hard delete when collected totals survive even if payment status drifted", () => {
    const result = assertAdminBookingDeleteSafe({
      status: "cancelled",
      payment_status: "pending",
      amount_paid_cents: 0,
      total_paid_zar: 1885,
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected collected-value booking delete to be blocked");
    expect(result.blocks.some((block) => block.code === "admin_booking_delete_total_paid_present")).toBe(true);
  });

});
