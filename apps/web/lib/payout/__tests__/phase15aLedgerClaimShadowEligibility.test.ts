import { beforeEach, describe, expect, it, vi } from "vitest";

const logSystemEvent = vi.fn();
const metricsIncrement = vi.fn();

vi.mock("@/lib/logging/systemLog", () => ({
  logSystemEvent: (...args: unknown[]) => logSystemEvent(...args),
}));

vi.mock("@/lib/metrics/counters", () => ({
  metrics: { increment: (...args: unknown[]) => metricsIncrement(...args) },
}));

import {
  measurePhase15aLedgerClaimShadowEligibility,
  PHASE15A_SHADOW_ELIGIBILITY_SOURCE,
} from "@/lib/payout/phase15aLedgerClaimShadowEligibility";

const CID = "aaaaaaaa-bbbb-4ccc-dddd-eeeeeeeeeeee";
const BID = "bbbbbbbb-bbbb-4ccc-dddd-eeeeeeeeeeee";
const EID = "cccccccc-cccc-4ccc-dddd-eeeeeeeeeeee";
const MID = "11111111-1111-4111-8111-111111111111";

type EarningRow = { id: string; booking_id: string; cleaner_id: string; status: string; disbursement_id: null };
type BookingRow = Record<string, unknown>;

function makeAdmin(params: {
  earnings: EarningRow[];
  bookings: BookingRow[];
  invoices?: { id: string; status: string }[];
  earningsError?: { message: string };
}) {
  const invoices = params.invoices ?? [];
  return {
    from(table: string) {
      if (table === "cleaner_earnings") {
        const c: Record<string, unknown> = {};
        c.select = () => c;
        c.eq = () => c;
        c.is = () =>
          Promise.resolve({
            data: params.earningsError ? null : params.earnings,
            error: params.earningsError ?? null,
          });
        return c;
      }
      if (table === "bookings") {
        return {
          select: () => ({
            in: () =>
              Promise.resolve({
                data: params.bookings,
                error: null,
              }),
          }),
        };
      }
      if (table === "monthly_invoices") {
        return {
          select: () => ({
            in: () =>
              Promise.resolve({
                data: invoices,
                error: null,
              }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
}

describe("measurePhase15aLedgerClaimShadowEligibility", () => {
  beforeEach(() => {
    logSystemEvent.mockClear();
    metricsIncrement.mockClear();
  });

  it("logs mismatch and increments metric when booking would fail bookingPayableForWeeklyBatch, without throwing", async () => {
    const admin = makeAdmin({
      earnings: [{ id: EID, booking_id: BID, cleaner_id: CID, status: "approved", disbursement_id: null }],
      bookings: [
        {
          id: BID,
          status: "completed",
          cleaner_id: CID,
          cleaner_payout_cents: 5000,
          cleaner_bonus_cents: 0,
          is_test: false,
          completed_at: "2026-01-01T00:00:00.000Z",
          date: "2026-01-01",
          billing_type: "prepaid",
          is_monthly_billing_booking: false,
          monthly_invoice_id: null,
          payment_status: "pending",
          payout_status: null,
          payout_frozen_cents: null,
          payment_state: null,
        },
      ],
    });

    await expect(measurePhase15aLedgerClaimShadowEligibility(admin as never, CID)).resolves.toBeUndefined();

    expect(logSystemEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        source: PHASE15A_SHADOW_ELIGIBILITY_SOURCE,
        message: "ledger_claim_would_fail_future_booking_authority_rules",
        context: expect.objectContaining({
          booking_id: BID,
          cleaner_id: CID,
          cleaner_earning_id: EID,
          payout_status: null,
          payment_status: "pending",
          payment_state: null,
          reason: "prepaid_customer_payment_not_settled",
        }),
      }),
    );
    expect(metricsIncrement).toHaveBeenCalledWith(
      "cleaner.phase15a_shadow_ledger_claim_mismatch",
      expect.objectContaining({
        reason: "prepaid_customer_payment_not_settled",
        booking_id: BID,
        cleaner_id: CID,
        cleaner_earning_id: EID,
      }),
    );
  });

  it("does not log mismatch when booking passes bookingPayableForWeeklyBatch", async () => {
    const admin = makeAdmin({
      earnings: [{ id: EID, booking_id: BID, cleaner_id: CID, status: "approved", disbursement_id: null }],
      bookings: [
        {
          id: BID,
          status: "completed",
          cleaner_id: CID,
          cleaner_payout_cents: 5000,
          cleaner_bonus_cents: 0,
          is_test: false,
          completed_at: "2026-01-01T00:00:00.000Z",
          date: "2026-01-01",
          billing_type: "prepaid",
          is_monthly_billing_booking: false,
          monthly_invoice_id: null,
          payment_status: "success",
          payout_status: null,
          payout_frozen_cents: null,
          payment_state: null,
        },
      ],
    });

    await measurePhase15aLedgerClaimShadowEligibility(admin as never, CID);

    expect(
      logSystemEvent.mock.calls.some(
        (c) => c[0]?.message === "ledger_claim_would_fail_future_booking_authority_rules",
      ),
    ).toBe(false);
    expect(metricsIncrement).not.toHaveBeenCalled();
  });

  it("skips shadow rows for is_test bookings (no mismatch log)", async () => {
    const admin = makeAdmin({
      earnings: [{ id: EID, booking_id: BID, cleaner_id: CID, status: "approved", disbursement_id: null }],
      bookings: [
        {
          id: BID,
          status: "completed",
          cleaner_id: CID,
          cleaner_payout_cents: 5000,
          is_test: true,
          billing_type: "prepaid",
          is_monthly_billing_booking: false,
          monthly_invoice_id: null,
          payment_status: "pending",
          payout_status: null,
          payment_state: null,
        },
      ],
    });

    await measurePhase15aLedgerClaimShadowEligibility(admin as never, CID);

    expect(logSystemEvent).not.toHaveBeenCalled();
    expect(metricsIncrement).not.toHaveBeenCalled();
  });

  it("uses monthly_invoices map for accrual bookings (payable when invoice paid)", async () => {
    const admin = makeAdmin({
      earnings: [{ id: EID, booking_id: BID, cleaner_id: CID, status: "approved", disbursement_id: null }],
      bookings: [
        {
          id: BID,
          status: "completed",
          cleaner_id: CID,
          cleaner_payout_cents: 4000,
          billing_type: "recurring_invoice",
          is_monthly_billing_booking: true,
          monthly_invoice_id: MID,
          payment_status: "success",
          payout_status: "eligible",
          payout_frozen_cents: 4000,
          is_test: false,
          payment_state: null,
        },
      ],
      invoices: [{ id: MID, status: "paid" }],
    });

    await measurePhase15aLedgerClaimShadowEligibility(admin as never, CID);

    expect(
      logSystemEvent.mock.calls.some(
        (c) => c[0]?.message === "ledger_claim_would_fail_future_booking_authority_rules",
      ),
    ).toBe(false);
  });
});
