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
    expect(writer).toContain('admin.rpc("apply_pending_booking_init_patch"');
    expect(writer).toContain("Pending checkout changed or settlement evidence exists.");
    expect(writer).not.toContain('.from("bookings")\n    .update({');

  });

  it("persists the actual Paystack charge as payable without writing collected cash", () => {
    const initialize = read("lib/booking/paystackInitializeCore.ts");
    const updateCall = initialize.slice(
      initialize.indexOf("updatePendingPaymentBookingForInit(admin"),
      initialize.indexOf("if (!upd.ok)", initialize.indexOf("updatePendingPaymentBookingForInit(admin")),
    );

    expect(updateCall).toContain("totalPriceZar: totalZar");
    expect(updateCall).not.toContain("totalPaidZar:");
    expect(initialize).toContain("total_price: totalZar");
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

    const initialAdmin = read("lib/admin/adminPaystackPostInitialize.ts");
    expect(initialAdmin).toContain("trustedBookingPayableZar({");
    expect(initialAdmin).toContain("total_price: row.total_price");

    const recoveryEmail = read("lib/email/paymentRecoveryEmails.ts");
    expect(recoveryEmail).toContain("trustedBookingPayableZar({");
    expect(recoveryEmail.indexOf("total_price:")).toBeGreaterThan(-1);
    expect(recoveryEmail.indexOf("total_paid_zar:")).toBeGreaterThan(
      recoveryEmail.indexOf("total_price:"),
    );

    const reminderCron = read("app/api/cron/payment-link-reminders/route.ts");
    expect(reminderCron).toContain("trustedBookingPayableZar({");
    expect(reminderCron).toContain("total_price: row.total_price");

    const recurringFallback = read("lib/recurring/recurringPaymentLinkFallback.ts");
    expect(recurringFallback).toContain("trustedBookingPayableZar({");
    expect(recurringFallback).toContain("total_price: head.total_price");
  });

  it("reconciles persisted checkout line items to the exact Paystack payable", () => {
    const initialize = read("lib/booking/paystackInitializeCore.ts");
    expect(initialize).toContain("const payableCents = zarToCents(totalZar)");
    expect(initialize).toContain("const payableDeltaCents = payableCents - sumLineItemsCents(visitLineItems)");
    expect(initialize).toContain('name: "Tip, discounts & payment adjustment"');
    expect(initialize).toContain("earns_cleaner: false");
    expect(initialize).toContain("if (lineSumCents !== payableCents)");
  });

  it("fails closed for complete pricing but rebuilds partial existing line items", () => {
    const initialize = read("lib/booking/paystackInitializeCore.ts");
    expect(initialize).toContain("if (hasLi && hasSnap)");
    expect(initialize).toContain("pricingComplete: true");
    expect(initialize).toContain("existingPayableZar");
    expect(initialize).toContain("existing pending payable differs from reinitialized charge");
    expect(initialize).toContain('errorCode: "PRICE_MISMATCH"');
    expect(initialize).toContain("Partial pricing state is not immutable yet");
    expect(initialize).toContain("return { bookingId: bid, skipLineItemInsert: false, pricingComplete: false }");
    expect(initialize).toContain("checkoutLineItems: pricingTarget.skipLineItemInsert ? null : checkoutLineItems");

    const writer = read("lib/booking/insertPendingPaymentBooking.ts");
    expect(writer).toContain('admin.rpc(\n      "replace_booking_line_items_atomic"');
    expect(writer).toContain("p_booking_id: params.bookingId");
    expect(writer).toContain("p_rows: rows");
    expect(writer).not.toContain("persistBookingLineItems(admin, params.bookingId, lineItems)");
  });

  it("preserves the stored recurring package payable during fallback only", () => {
    const initialize = read("lib/booking/paystackInitializeCore.ts");
    expect(initialize).toContain("preserveExistingPendingPayable?: boolean");
    expect(initialize).toContain("preservedExistingPayableZar");
    expect(initialize).toContain("preservedExistingPriceSnapshot");
    expect(initialize).toContain("const totalZar = preservedExistingPayableZar ?? recomputedTotalZar");
    expect(initialize).toContain('payment_scope: "recurring_first_30_days" as const');
    expect(initialize).toContain("per_visit_price_zar");
    expect(initialize).toContain("prepaid_visit_count");

    const recurringFallback = read("lib/recurring/recurringPaymentLinkFallback.ts");
    expect(recurringFallback).toContain("{ preserveExistingPendingPayable: true }");

    const recurringPropagation = read("lib/recurring/propagateRecurringPlanToGeneratedBookings.ts");
    expect(recurringPropagation).toContain("preserveRecurringPackagePayable");
    expect(recurringPropagation).toContain('payment_scope === "recurring_first_30_days"');
    expect(recurringPropagation).toContain("safelyUnpaidPending");
    expect(recurringPropagation).toContain('from("payment_transactions")');
    expect(recurringPropagation).toContain("settlementMarkerPresent");
    expect(recurringPropagation).toContain("bookingUncollectedCashColumns()");
    expect(recurringPropagation).not.toContain("total_paid_zar: priceZar");
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
    expect(sql).toContain("not in ('success', 'paid', 'succeeded', 'completed', 'pending_monthly')");
    expect(sql).toContain("in ('success', 'paid', 'succeeded', 'completed', 'pending_monthly')");
    expect(sql).toContain("payment_completed_at is not null");
    expect(sql).toContain("paid_at is not null");
    expect(sql).toContain("payment_transaction_id is not null");
    expect(sql).toContain("marked_paid_by_admin_id is not null");
    expect(sql).toContain("audit_02a01_ledger_only_settlement_requires_manual_reconciliation");
    expect(sql).toContain("audit_02a01_divergent_cash_mirrors_require_manual_reconciliation");
    expect(sql).toContain("coalesce(b.total_paid_zar, 0) <= 0");
    expect(sql).toContain("do $audit02a01$");
    expect(sql).toContain("$audit02a01$;");
    expect(sql).toContain("audit_02a01_legacy_payable_corroboration_failed");
    expect(sql).toContain("create or replace function public.apply_pending_booking_init_patch");
    expect(sql).toContain("for update");
    expect(sql).toContain("from public.payment_transactions pt");
    expect(sql).toContain("grant execute on function public.apply_pending_booking_init_patch(uuid, jsonb) to service_role");
    expect(sql).not.toContain("    user_id,");
    expect(sql).not.toContain("      x.user_id,");
    expect(sql).toContain("booking_snapshot->'total_zar'");
    expect(sql).toContain("booking_snapshot->>'total_zar'");
    expect(sql).toContain("price_snapshot->'total_price'");
    expect(sql).toContain("price_snapshot->>'total_price'");
    expect(sql).toContain("sum(coalesce(bli.total_price_cents, 0))");
    expect(sql).toContain("fail closed when neither shape corroborates total_paid_zar");
    expect(sql).toContain(") is not true");
    expect(sql).toContain("total_price = b.total_paid_zar");
    expect(sql).toContain("'{pay_total_zar}'");
    expect(sql.indexOf("total_price = b.total_paid_zar")).toBeLessThan(
      sql.indexOf("amount_paid_cents = 0"),
    );
    expect(sql).toContain("validate constraint bookings_pending_unpaid_cash_zero");
  });
});
