import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { bookingUncollectedCashColumns } from "@/lib/booking/bookingPaidAmountColumns";
import { trustedBookingPayableZar } from "@/lib/booking/ensureBookingPaymentSession";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("AUDIT-02A01 pending-payment cash source of truth", () => {
  it("keeps unpaid collected-cash columns explicitly zero", () => {
    expect(bookingUncollectedCashColumns()).toEqual({
      amount_paid_cents: 0,
      total_paid_cents: 0,
      total_paid_zar: 0,
    });

    const writer = read("lib/booking/insertPendingPaymentBooking.ts");
    expect(writer).toContain("...bookingUncollectedCashColumns()");
    expect(writer).not.toContain("total_paid_zar: params.totalPaidZar");
    expect(writer).not.toContain("totalPaidZar: number");
  });

  it("does not pass the amount due into the pending cash writer", () => {
    const initialize = read("lib/booking/paystackInitializeCore.ts");
    const updateCall = initialize.slice(
      initialize.indexOf("updatePendingPaymentBookingForInit(admin"),
      initialize.indexOf("if (!upd.ok)", initialize.indexOf("updatePendingPaymentBookingForInit(admin")),
    );

    expect(updateCall).toContain("totalPriceZar: checkout.visitTotalZar");
    expect(updateCall).not.toContain("totalPaidZar:");
  });

  it("resolves payment-link payable from total_price before legacy cash fallback", () => {
    expect(
      trustedBookingPayableZar({
        total_price: 480,
        total_paid_zar: 0,
      }),
    ).toBe(480);

    expect(
      trustedBookingPayableZar({
        total_price: null,
        total_paid_zar: 480,
      }),
    ).toBe(480);

    const resend = read("app/api/admin/bookings/[id]/resend-payment-link/route.ts");
    expect(resend).toContain("trustedBookingPayableZar({");
    expect(resend).toContain("total_price: r.total_price");
  });

  it("repairs only evidence-free anomalies and adds a validated DB guard", () => {
    const sql = read(
      "../../supabase/migrations/20261007023000_audit_02a01_pending_cash_sot.sql",
    ).toLowerCase();

    expect(sql).toContain("payment_completed_at is null");
    expect(sql).toContain("paid_at is null");
    expect(sql).toContain("payment_transaction_id is null");
    expect(sql).toContain("marked_paid_by_admin_id is null");
    expect(sql).toContain("not exists");
    expect(sql).toContain("from public.payment_transactions");
    expect(sql).toContain("bookings_pending_unpaid_cash_zero");
    expect(sql).toContain("payment_status, 'pending'");
    expect(sql).toContain("<> 'pending_monthly'");
    expect(sql).toContain("validate constraint bookings_pending_unpaid_cash_zero");
  });
});
