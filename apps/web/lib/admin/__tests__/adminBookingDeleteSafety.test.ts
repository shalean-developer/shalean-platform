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

  it("blocks hard delete for monthly financial flow before invoice linkage", () => {
    const result = assertAdminBookingDeleteSafe({
      status: "pending",
      payment_status: "pending_monthly",
      amount_paid_cents: 0,
      is_monthly_billing_booking: true,
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected monthly financial flow delete to be blocked");
    expect(result.blocks.some((block) => block.code === "admin_booking_delete_monthly_financial_flow")).toBe(true);
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

  it("blocks hard delete when completed_at survives even if status drifted", () => {
    const result = assertAdminBookingDeleteSafe({
      status: "cancelled",
      completed_at: "2026-10-11T00:00:00.000Z",
      payment_status: "pending",
      amount_paid_cents: 0,
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected completed_at booking delete to be blocked");
    expect(result.blocks.some((block) => block.code === "admin_booking_delete_completed_at_present")).toBe(true);
  });

  it("blocks hard delete when cleaner line earnings were finalized even at zero", () => {
    const result = assertAdminBookingDeleteSafe({
      status: "cancelled",
      cleaner_line_earnings_finalized_at: "2026-10-11T00:00:00.000Z",
      payment_status: "pending",
      amount_paid_cents: 0,
      cleaner_earnings_total_cents: 0,
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected finalized line earnings marker to block delete");
    expect(result.blocks.some((block) => block.code === "admin_booking_delete_line_earnings_finalized")).toBe(true);
  });

  it("blocks hard delete when frozen cleaner earnings allocation lines survive", () => {
    const result = assertAdminBookingDeleteSafe({
      status: "cancelled",
      payment_status: "pending",
      amount_paid_cents: 0,
      linked_earnings_snapshot_line_id: "30303030-3030-4030-8030-303030303030",
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected snapshot-line-linked booking delete to be blocked");
    expect(result.blocks.some((block) => block.code === "admin_booking_delete_earnings_snapshot_line_linked")).toBe(true);
  });

  it("blocks hard delete when a partial deposit survives", () => {
    const result = assertAdminBookingDeleteSafe({
      status: "pending_payment",
      payment_status: "pending",
      amount_paid_cents: 0,
      deposit_paid_cents: 25000,
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected deposit-backed booking delete to be blocked");
    expect(result.blocks.some((block) => block.code === "admin_booking_delete_deposit_paid_present")).toBe(true);
  });

  it("blocks hard delete when a refund marker survives", () => {
    const result = assertAdminBookingDeleteSafe({
      status: "cancelled",
      payment_status: "pending",
      amount_paid_cents: 0,
      refund_status: "chargeback",
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected refund-marked booking delete to be blocked");
    expect(result.blocks.some((block) => block.code === "admin_booking_delete_refund_marker_present")).toBe(true);
  });

  it("blocks hard delete when payout reconciliation markers survive", () => {
    const result = assertAdminBookingDeleteSafe({
      status: "cancelled",
      payment_status: "pending",
      amount_paid_cents: 0,
      payout_paid_at: "2026-10-11T00:00:00.000Z",
      payout_run_id: "20202020-2020-4020-8020-202020202020",
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected payout-marker booking delete to be blocked");
    expect(result.blocks.some((block) => block.code === "admin_booking_delete_payout_paid_at_present")).toBe(true);
    expect(result.blocks.some((block) => block.code === "admin_booking_delete_payout_run_linked")).toBe(true);
  });

  it("blocks hard delete when a Zoho invoice survives", () => {
    const result = assertAdminBookingDeleteSafe({
      status: "cancelled",
      payment_status: "pending",
      amount_paid_cents: 0,
      zoho_invoice_id: "zoho-invoice-1",
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected Zoho-linked booking delete to be blocked");
    expect(result.blocks.some((block) => block.code === "admin_booking_delete_zoho_invoice_linked")).toBe(true);
  });

  it("blocks hard delete when an external settlement reference survives", () => {
    const result = assertAdminBookingDeleteSafe({
      status: "cancelled",
      payment_status: "pending",
      amount_paid_cents: 0,
      payment_reference_external: "EFT-REF-123",
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected external-reference booking delete to be blocked");
    expect(result.blocks.some((block) => block.code === "admin_booking_delete_external_payment_reference")).toBe(true);
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

  it("blocks hard delete when line-item cleaner earnings survive", () => {
    const result = assertAdminBookingDeleteSafe({
      status: "cancelled",
      payment_status: "pending",
      amount_paid_cents: 0,
      linked_line_item_earnings_id: "26262626-2626-4626-8626-262626262626",
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected line-item-earnings-linked booking delete to be blocked");
    expect(result.blocks.some((block) => block.code === "admin_booking_delete_line_item_earnings_linked")).toBe(true);
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

  it("blocks hard delete when a payout audit event survives", () => {
    const result = assertAdminBookingDeleteSafe({
      status: "cancelled",
      payment_status: "pending",
      amount_paid_cents: 0,
      linked_payout_audit_event_id: "21212121-2121-4212-8212-212121212121",
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected payout-audit-linked booking delete to be blocked");
    expect(result.blocks.some((block) => block.code === "admin_booking_delete_payout_audit_linked")).toBe(true);
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

  it("blocks hard delete when a refund accounting record survives", () => {
    const result = assertAdminBookingDeleteSafe({
      status: "cancelled",
      payment_status: "pending",
      amount_paid_cents: 0,
      linked_refund_record_id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected refund-linked booking delete to be blocked");
    expect(result.blocks.some((block) => block.code === "admin_booking_delete_refund_record_linked")).toBe(true);
  });

  it("blocks hard delete when a referral redemption survives", () => {
    const result = assertAdminBookingDeleteSafe({
      status: "cancelled",
      payment_status: "pending",
      amount_paid_cents: 0,
      linked_referral_redemption_id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected referral-redemption-linked booking delete to be blocked");
    expect(result.blocks.some((block) => block.code === "admin_booking_delete_referral_redemption_linked")).toBe(true);
  });

  it("blocks hard delete when a referral event survives", () => {
    const result = assertAdminBookingDeleteSafe({
      status: "cancelled",
      payment_status: "pending",
      amount_paid_cents: 0,
      linked_referral_event_id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected referral-event-linked booking delete to be blocked");
    expect(result.blocks.some((block) => block.code === "admin_booking_delete_referral_event_linked")).toBe(true);
  });

  it("blocks hard delete when a money-action proposal survives", () => {
    const result = assertAdminBookingDeleteSafe({
      status: "cancelled",
      payment_status: "pending",
      amount_paid_cents: 0,
      linked_money_proposal_id: "12121212-1212-4212-8212-121212121212",
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected proposal-linked booking delete to be blocked");
    expect(result.blocks.some((block) => block.code === "admin_booking_delete_money_proposal_linked")).toBe(true);
  });

  it("blocks hard delete when accounting invoice sync survives", () => {
    const result = assertAdminBookingDeleteSafe({
      status: "cancelled",
      payment_status: "pending",
      amount_paid_cents: 0,
      linked_accounting_invoice_sync_id: "15151515-1515-4515-8515-151515151515",
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected accounting-invoice-sync-linked booking delete to be blocked");
    expect(result.blocks.some((block) => block.code === "admin_booking_delete_accounting_invoice_sync_linked")).toBe(true);
  });

  it("blocks hard delete when accounting sync history survives", () => {
    const result = assertAdminBookingDeleteSafe({
      status: "cancelled",
      payment_status: "pending",
      amount_paid_cents: 0,
      linked_accounting_sync_id: "16161616-1616-4616-8616-161616161616",
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected accounting-sync-linked booking delete to be blocked");
    expect(result.blocks.some((block) => block.code === "admin_booking_delete_accounting_sync_linked")).toBe(true);
  });

  it("blocks hard delete when an admin earnings action survives", () => {
    const result = assertAdminBookingDeleteSafe({
      status: "cancelled",
      payment_status: "pending",
      amount_paid_cents: 0,
      linked_earnings_action_id: "13131313-1313-4313-8313-131313131313",
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected earnings-action-linked booking delete to be blocked");
    expect(result.blocks.some((block) => block.code === "admin_booking_delete_earnings_action_linked")).toBe(true);
  });

  it("blocks hard delete when a promotion redemption survives", () => {
    const result = assertAdminBookingDeleteSafe({
      status: "cancelled",
      payment_status: "pending",
      amount_paid_cents: 0,
      linked_promotion_redemption_id: "14141414-1414-4414-8414-141414141414",
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected promotion-redemption-linked booking delete to be blocked");
    expect(result.blocks.some((block) => block.code === "admin_booking_delete_promotion_redemption_linked")).toBe(true);
  });

  it("blocks hard delete when internal cleaner earnings survive", () => {
    const result = assertAdminBookingDeleteSafe({
      status: "cancelled",
      payment_status: "pending",
      amount_paid_cents: 0,
      internal_earnings_cents: 7500,
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected internal cleaner earnings to block delete");
    expect(result.blocks.some((block) => block.code === "admin_booking_delete_internal_earnings_present")).toBe(true);
  });

  it("blocks hard delete when finalized cleaner earnings total survives", () => {
    const result = assertAdminBookingDeleteSafe({
      status: "cancelled",
      payment_status: "pending",
      amount_paid_cents: 0,
      cleaner_earnings_total_cents: 5000,
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected finalized cleaner earnings to block delete");
    expect(result.blocks.some((block) => block.code === "admin_booking_delete_cleaner_earnings_total_present")).toBe(true);
  });

  it("blocks hard delete when canonical payout earnings survive", () => {
    const result = assertAdminBookingDeleteSafe({
      status: "cancelled",
      payment_status: "pending",
      amount_paid_cents: 0,
      payout_earnings_cents: 5000,
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected canonical payout earnings to block delete");
    expect(result.blocks.some((block) => block.code === "admin_booking_delete_payout_earnings_present")).toBe(true);
  });

  it("blocks hard delete when inventory cost history survives", () => {
    const result = assertAdminBookingDeleteSafe({
      status: "cancelled",
      payment_status: "pending",
      amount_paid_cents: 0,
      linked_inventory_cost_id: "17171717-1717-4717-8717-171717171717",
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected inventory-cost-linked booking delete to be blocked");
    expect(result.blocks.some((block) => block.code === "admin_booking_delete_inventory_cost_linked")).toBe(true);
  });

  it("blocks hard delete when transport cost history survives", () => {
    const result = assertAdminBookingDeleteSafe({
      status: "cancelled",
      payment_status: "pending",
      amount_paid_cents: 0,
      linked_transport_cost_id: "18181818-1818-4818-8818-181818181818",
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected transport-cost-linked booking delete to be blocked");
    expect(result.blocks.some((block) => block.code === "admin_booking_delete_transport_cost_linked")).toBe(true);
  });

  it("blocks hard delete when a cleaner earnings snapshot survives", () => {
    const result = assertAdminBookingDeleteSafe({
      status: "cancelled",
      payment_status: "pending",
      amount_paid_cents: 0,
      linked_earnings_snapshot_booking_id: "19191919-1919-4919-8919-191919191919",
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected earnings-snapshot-linked booking delete to be blocked");
    expect(result.blocks.some((block) => block.code === "admin_booking_delete_earnings_snapshot_linked")).toBe(true);
  });

  it("blocks hard delete when an immutable booking change survives", () => {
    const result = assertAdminBookingDeleteSafe({
      status: "cancelled",
      payment_status: "pending",
      amount_paid_cents: 0,
      linked_booking_change_id: "22222222-2222-4222-8222-222222222223",
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected booking-change-linked delete to be blocked");
    expect(result.blocks.some((block) => block.code === "admin_booking_delete_booking_change_linked")).toBe(true);
  });

  it("blocks hard delete when paid conversion attribution survives", () => {
    const result = assertAdminBookingDeleteSafe({
      status: "cancelled",
      payment_status: "pending",
      amount_paid_cents: 0,
      linked_growth_attribution_id: "23232323-2323-4323-8323-232323232323",
      linked_conversion_attribution_id: "24242424-2424-4424-8424-242424242424",
      linked_email_attribution_id: "25252525-2525-4525-8525-252525252525",
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected attribution-linked delete to be blocked");
    expect(result.blocks.some((block) => block.code === "admin_booking_delete_growth_attribution_linked")).toBe(true);
    expect(result.blocks.some((block) => block.code === "admin_booking_delete_conversion_attribution_linked")).toBe(true);
    expect(result.blocks.some((block) => block.code === "admin_booking_delete_email_attribution_linked")).toBe(true);
  });

  it("blocks hard delete when legacy total_paid_zar survives", () => {
    const result = assertAdminBookingDeleteSafe({
      status: "cancelled",
      payment_status: "pending",
      amount_paid_cents: 0,
      total_paid_cents: 0,
      total_paid_zar: 1885,
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected legacy total_paid_zar to block delete");
    expect(result.blocks.some((block) => block.code === "admin_booking_delete_total_paid_present")).toBe(true);
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
