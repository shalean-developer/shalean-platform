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

  it("blocks hard delete when a booking was marked paid by an admin", () => {
    const result = assertAdminBookingDeleteSafe({
      status: "cancelled",
      payment_status: "pending",
      amount_paid_cents: 0,
      marked_paid_by_admin_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected admin-paid booking delete to be blocked");
    expect(result.blocks.some((block) => block.code === "admin_booking_delete_marked_paid_by_admin")).toBe(true);
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

  it("blocks hard delete when an expense still references the booking", () => {
    const result = assertAdminBookingDeleteSafe({
      status: "cancelled",
      payment_status: "pending",
      amount_paid_cents: 0,
      linked_expense_id: "44444444-4444-4444-8444-444444444444",
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected expense-linked booking delete to be blocked");
    expect(result.blocks.some((block) => block.code === "admin_booking_delete_expense_linked")).toBe(true);
  });

  it("blocks hard delete when approved cleaner earnings survive", () => {
    const result = assertAdminBookingDeleteSafe({
      status: "cancelled",
      payment_status: "pending",
      amount_paid_cents: 0,
      linked_cleaner_earning_id: "55555555-5555-4555-8555-555555555555",
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected cleaner-earnings-linked booking delete to be blocked");
    expect(result.blocks.some((block) => block.code === "admin_booking_delete_cleaner_earnings_linked")).toBe(true);
  });

  it("blocks hard delete when a cleaner earnings adjustment survives", () => {
    const result = assertAdminBookingDeleteSafe({
      status: "cancelled",
      payment_status: "pending",
      amount_paid_cents: 0,
      linked_cleaner_earnings_adjustment_id: "66666666-6666-4666-8666-666666666666",
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected cleaner adjustment-linked booking delete to be blocked");
    expect(result.blocks.some((block) => block.code === "admin_booking_delete_cleaner_earnings_adjustment_linked")).toBe(true);
  });

  it("blocks hard delete when a cleaner earnings dispute survives", () => {
    const result = assertAdminBookingDeleteSafe({
      status: "cancelled",
      payment_status: "pending",
      amount_paid_cents: 0,
      linked_cleaner_earnings_dispute_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected cleaner-dispute-linked booking delete to be blocked");
    expect(result.blocks.some((block) => block.code === "admin_booking_delete_cleaner_earnings_dispute_linked")).toBe(true);
  });

  it("blocks hard delete when a team member payout allocation survives", () => {
    const result = assertAdminBookingDeleteSafe({
      status: "cancelled",
      payment_status: "pending",
      amount_paid_cents: 0,
      linked_team_member_payout_id: "77777777-7777-4777-8777-777777777777",
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected team-payout-linked booking delete to be blocked");
    expect(result.blocks.some((block) => block.code === "admin_booking_delete_team_member_payout_linked")).toBe(true);
  });

  it("blocks hard delete when a roster member payout allocation survives", () => {
    const result = assertAdminBookingDeleteSafe({
      status: "cancelled",
      payment_status: "pending",
      amount_paid_cents: 0,
      linked_roster_member_payout_id: "88888888-8888-4888-8888-888888888888",
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected roster-payout-linked booking delete to be blocked");
    expect(result.blocks.some((block) => block.code === "admin_booking_delete_roster_member_payout_linked")).toBe(true);
  });

  it("blocks hard delete when a Cleaning Credit transaction survives", () => {
    const result = assertAdminBookingDeleteSafe({
      status: "cancelled",
      payment_status: "pending",
      amount_paid_cents: 0,
      linked_cleaning_credit_transaction_id: "99999999-9999-4999-8999-999999999999",
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected Cleaning Credit-linked booking delete to be blocked");
    expect(result.blocks.some((block) => block.code === "admin_booking_delete_cleaning_credit_transaction_linked")).toBe(true);
  });

  it("blocks hard delete when an invoice adjustment survives", () => {
    const result = assertAdminBookingDeleteSafe({
      status: "cancelled",
      payment_status: "pending",
      amount_paid_cents: 0,
      linked_invoice_adjustment_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected invoice-adjustment-linked booking delete to be blocked");
    expect(result.blocks.some((block) => block.code === "admin_booking_delete_invoice_adjustment_linked")).toBe(true);
  });

  it("blocks hard delete when collected totals survive even if payment status drifted", () => {
    const result = assertAdminBookingDeleteSafe({
      status: "cancelled",
      payment_status: "pending",
      amount_paid_cents: 0,
      total_paid_cents: 188500,
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected collected-value booking delete to be blocked");
    expect(result.blocks.some((block) => block.code === "admin_booking_delete_total_paid_present")).toBe(true);
  });
});
