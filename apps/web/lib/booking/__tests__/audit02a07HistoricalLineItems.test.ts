import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

import { buildAudit02A07BookingLineItems } from "@/lib/booking/buildAudit02A07BookingLineItems";

describe("AUDIT-02A07 historical Booking V2 line-item repair", () => {
  it("preserves exact source lines and reconciles a recorded promotion discount", () => {
    const built = buildAudit02A07BookingLineItems({
      bookingId: "11111111-1111-4111-8111-111111111111",
      declaredTotalCents: 111300,
      bookingSnapshot: {
        pricingSummary: {
          lineItems: [
            { label: "Regular Cleaning (base)", amountZar: 250 },
            { label: "3 bedrooms", amountZar: 90 },
            { label: "3 bathrooms", amountZar: 105 },
            { label: "Service fee", amountZar: 30 },
            { label: "Example extra", amountZar: 835 },
          ],
        },
        promotionCheckout: { totalDiscountZar: 197 },
      },
      priceBreakdown: null,
      isTeamJob: false,
    });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.items.reduce((s, x) => s + x.total_price_cents, 0)).toBe(111300);
    expect(built.items.some((x) => x.item_type === "adjustment" && x.total_price_cents === -19700)).toBe(true);
  });

  it("reconstructs the audited incident-recovery aggregate breakdown", () => {
    const built = buildAudit02A07BookingLineItems({
      bookingId: "22222222-2222-4222-8222-222222222222",
      declaredTotalCents: 180200,
      bookingSnapshot: null,
      pricingSummary: null,
      priceBreakdown: {
        base_zar: 1770,
        extras_zar: 350,
        discount_zar: 318,
      },
      isTeamJob: false,
    });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.evidenceKind).toBe("incident_recovery_breakdown");
    expect(built.items.reduce((s, x) => s + x.total_price_cents, 0)).toBe(180200);
  });

  it("can suppress cleaner earnings for historical detail reconstruction", () => {
    const built = buildAudit02A07BookingLineItems({
      bookingId: "33333333-3333-4333-8333-333333333333",
      declaredTotalCents: 48600,
      bookingSnapshot: {
        pricingSummary: {
          lineItems: [
            { label: "Regular Cleaning (base)", amountZar: 250 },
            { label: "3 bedrooms", amountZar: 90 },
            { label: "3 bathrooms", amountZar: 105 },
            { label: "Interior walls", amountZar: 35 },
            { label: "VIP loyalty discount", amountZar: -24 },
            { label: "Service fee", amountZar: 30 },
          ],
        },
      },
      isTeamJob: false,
      suppressCleanerEarnings: true,
    });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.items.reduce((sum, item) => sum + item.total_price_cents, 0)).toBe(48600);
    expect(built.items.every((item) => item.earns_cleaner === false)).toBe(true);
  });

  it("fails closed for unfinalized solo targets unless they are cancelled with no earnings history", () => {
    const root = path.resolve(process.cwd(), "../..");
    const source = readFileSync(path.join(root, "apps/web/scripts/audit02a07HistoricalLineItems.ts"), "utf8");
    expect(source).toContain('status !== "cancelled" || hasEarningsState');
    expect(source).toContain("solo historical repair requires cancelled booking with no earnings/payout history");
    expect(source).toContain('historicalSafetyClass:');
    expect(source).toContain('"cancelled_solo_no_earnings_history"');
  });

  it("keeps the R19 mismatch repair additive and earnings-neutral", () => {
    const root = path.resolve(process.cwd(), "../..");
    const source = readFileSync(path.join(root, "apps/web/scripts/audit02a07HistoricalLineItems.ts"), "utf8");
    expect(source).toContain('existingLine?.name !== "Recurring service"');
    expect(source).toContain('existingLine?.pricing_source !== "exact_source_lines_v1"');
    expect(source).toContain("cleaner_earnings_cents ?? 0) !== 30000");
    expect(source).toContain("reconciliationCents !== 1900");
    expect(source).toContain("plannedInsertEarnsCleaner: false");
    expect(source).toContain("cleanerEarningsDeltaCents: 0");
  });

  it("keeps the historical repair allowlist fixed at 26 and blocks apply before staging closeout", () => {
    const root = path.resolve(process.cwd(), "../..");
    const source = readFileSync(path.join(root, "apps/web/scripts/audit02a07HistoricalLineItems.ts"), "utf8");
    expect((source.match(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi) ?? []).length).toBeGreaterThanOrEqual(26);
    expect(source).toContain("AUDIT-02A07 apply requires exactly one --booking-id=<uuid>.");
    expect(source).toContain("AUDIT-02A07 apply blocked. Set AUDIT_02A07_APPLY=YES.");
    expect(source).toContain('CANONICAL_PRODUCTION_PROJECT_REF = "paqjwfulwywtsyyvdxrq"');
    expect(source).toContain("AUDIT_02A07_EXPECTED_PROJECT_REF");
    expect(source).toContain("configured Supabase project");
    expect(source).toContain('admin.rpc("apply_audit_02a07_historical_line_items"');
  });

  it("requires R0 line items before zero-balance settlement", () => {
    const root = path.resolve(process.cwd(), "../..");
    const source = readFileSync(path.join(root, "apps/web/app/api/booking-v2/confirm/route.ts"), "utf8");
    const ensureIndex = source.indexOf("ensureBookingV2R0LineItems(supabase, bookingId)");
    const creditIndex = source.indexOf("settleCleaningCreditForBooking(supabase, bookingId)");
    const settleIndex = source.indexOf("settleFullyCoveredBooking(supabase, { bookingId, payAmountZar })");
    expect(ensureIndex).toBeGreaterThan(-1);
    expect(creditIndex).toBeGreaterThan(ensureIndex);
    expect(settleIndex).toBeGreaterThan(creditIndex);
    expect(source).toContain("R0 line-item persistence failed");
  });

  it("uses the atomic snapshot-bound R0 line-item RPC", () => {
    const root = path.resolve(process.cwd(), "../..");
    const helper = readFileSync(path.join(root, "apps/web/lib/booking/ensureBookingV2R0LineItems.ts"), "utf8");
    const migration = readFileSync(path.join(root, "supabase/migrations/20261012014500_audit_02a07_atomic_r0_line_items.sql"), "utf8");
    expect(helper).toContain('admin.rpc("replace_pending_r0_booking_line_items"');
    expect(helper).toContain("p_expected_evidence");
    expect(migration).toContain("for update");
    expect(migration).toContain("pricing_evidence_changed");
    expect(migration).toContain("existing_line_items_conflict");
    const retryMigration = readFileSync(path.join(root, "supabase/migrations/20261012063000_audit_02a07_r0_retry_line_items.sql"), "utf8");
    expect(retryMigration).toContain("'checkout_lock_catalog_v1'");
    expect(retryMigration).toContain("'checkout_payable_reconciliation_v1'");
    expect(retryMigration).toContain("pending_line_items_financial_state_changed");
    expect(migration).toContain("grant execute on function public.replace_pending_r0_booking_line_items");
    expect(migration).toContain("to service_role");
    expect(migration).toContain("revoke all on function public.replace_pending_r0_booking_line_items");
  });

  it("governs production historical apply with an allowlisted service-role RPC", () => {
    const root = path.resolve(process.cwd(), "../..");
    const migration = readFileSync(path.join(root, "supabase/migrations/20261012054000_audit_02a07_historical_line_items_apply.sql"), "utf8");
    const source = readFileSync(path.join(root, "apps/web/scripts/audit02a07HistoricalLineItems.ts"), "utf8");
    expect(migration).toContain("booking_outside_allowlist");
    expect(migration).toContain("solo_booking_not_earnings_safe");
    expect(migration).toContain("historical_line_must_not_earn_cleaner");
    expect(migration).toContain("mismatch_booking_total_changed");
    expect(migration).toContain("mismatch_booking_financial_state_changed");
    expect(migration).toContain("mismatch_existing_line_state_changed");
    expect(migration).toContain("already_repaired");
    expect(migration).toContain("grant execute on function public.apply_audit_02a07_historical_line_items");
    expect(migration).toContain("to service_role");
    expect(source).toContain("earnings/payout state changed during repair");
    expect(source).toContain("booking total changed during repair");
    expect(source).toContain('reconciliation: "PASS"');
  });

  it("retains the current Paystack line-item fail-closed invariant", () => {
    const root = path.resolve(process.cwd(), "../..");
    const source = readFileSync(path.join(root, "apps/web/lib/booking/paystackInitializeCore.ts"), "utf8");
    expect(source).toContain("checkoutLineItems");
    expect(source).toContain("checkout line sum != payable total");
    expect(source).toContain('errorCode: "PRICE_MISMATCH"');
    expect(source).toContain("deleteRowOnLineItemPersistFail");
  });
});
