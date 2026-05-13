import { describe, expect, it } from "vitest";
import { buildCheckoutVisitLineItems, buildMonthlyBundledZarLineItems } from "@/lib/booking/buildBookingLineItems";
import {
  allocateDisplayCentsAcrossLineItems,
  sumEligibleLineItemsSubtotalCents,
  type EarningsLineItemInput,
} from "@/lib/payout/computeEarningsFromLineItems";
import { calculateCleanerPayoutFromBookingRow } from "@/lib/payout/calculateCleanerPayout";
import { bookingPayableForWeeklyBatch } from "@/lib/payout/bookingPayableForWeeklyBatch";
import { bookingAppointmentIsoUtc, resolveCanonicalCleanerPayout } from "@/lib/payout/canonicalCleanerPayout";
import { resolveCleanerFrozenCentsForSettlement } from "@/lib/cleaner/resolveCleanerEarnings";
import { buildTeamJobMemberFixedPerCleanerPayoutRows } from "@/lib/payout/teamRosterPayoutAllocation";

const CLEANER_JOINED_AT = "2025-01-01T00:00:00.000Z";
const BOOKING_DATE = "2026-01-20";
const BOOKING_TIME = "09:00";
const BOOKING_APPOINTMENT = bookingAppointmentIsoUtc(BOOKING_DATE, BOOKING_TIME)!;

function withIds(
  items: Array<{
    item_type: string;
    slug?: string | null;
    name?: string | null;
    metadata?: Record<string, unknown> | null;
    earns_cleaner?: boolean | null;
    total_price_cents: number;
  }>,
): EarningsLineItemInput[] {
  return items.map((item, idx) => ({
    id: `line-${idx + 1}`,
    item_type: item.item_type,
    slug: item.slug ?? null,
    name: item.name ?? null,
    metadata: item.metadata ?? null,
    earns_cleaner: item.earns_cleaner ?? null,
    total_price_cents: item.total_price_cents,
  }));
}

function displayFromLineSubtotal(params: {
  lineSubtotalCents: number;
  serviceId?: string;
  isTeamJob?: boolean;
  teamCleanerCount?: number;
}): ReturnType<typeof resolveCanonicalCleanerPayout> {
  return resolveCanonicalCleanerPayout({
    serviceId: params.serviceId ?? "standard",
    cleanerJoinedAtIso: CLEANER_JOINED_AT,
    bookingAppointmentIsoUtc: BOOKING_APPOINTMENT,
    bookingValueCents: params.lineSubtotalCents,
    isTeamJob: params.isTeamJob === true,
    teamCleanerCount: params.teamCleanerCount,
  });
}

function legacySoloColumns(params: {
  baseAmountCents: number;
  amountPaidCents: number;
  serviceFeeCents?: number;
  serviceId?: string;
}) {
  return calculateCleanerPayoutFromBookingRow({
    totalPaidZar: null,
    amountPaidCents: params.amountPaidCents,
    baseAmountCents: params.baseAmountCents,
    serviceFeeCents: params.serviceFeeCents ?? 0,
    serviceLabel: params.serviceId ?? "standard",
    bookingSnapshot: { locked: { service: params.serviceId ?? "standard", date: BOOKING_DATE, time: BOOKING_TIME } },
    cleanerJoinedAtIso: CLEANER_JOINED_AT,
    bookingDate: BOOKING_DATE,
    bookingTime: BOOKING_TIME,
  });
}

function weeklyBasisCents(row: { cleaner_payout_cents: number; cleaner_bonus_cents?: number | null }): number {
  return Math.max(0, Math.floor(row.cleaner_payout_cents)) + Math.max(0, Math.floor(Number(row.cleaner_bonus_cents ?? 0)));
}

describe("pricing / earnings parity matrix", () => {
  it("keeps prepaid extras aligned when checkout line subtotal and legacy payout base match", () => {
    const lineItems = withIds(
      buildCheckoutVisitLineItems({
        serviceTypeSlug: "standard",
        job: { serviceBaseZar: 200, roomsZar: 150, extrasZar: 100 },
        subtotalZar: 450,
        visitTotalZar: 450,
      }),
    );

    const lineSubtotalCents = sumEligibleLineItemsSubtotalCents(lineItems);
    const display = displayFromLineSubtotal({ lineSubtotalCents });
    const legacy = legacySoloColumns({ baseAmountCents: 45_000, amountPaidCents: 45_000 });
    const frozen = resolveCleanerFrozenCentsForSettlement({
      display_earnings_cents: display.displayEarningsCents,
      cleaner_payout_cents: legacy.payoutCents,
    });
    const lineAllocations = allocateDisplayCentsAcrossLineItems(display.displayEarningsCents, lineItems);
    const weeklyRow = {
      status: "completed",
      cleaner_id: "cleaner-1",
      cleaner_payout_cents: legacy.payoutCents,
      cleaner_bonus_cents: legacy.bonusCents,
      payment_status: "success",
    };

    expect(lineSubtotalCents).toBe(45_000);
    expect(lineItems.some((item) => item.item_type === "extra")).toBe(true);
    expect(display.displayEarningsCents).toBe(31_500);
    expect(lineAllocations.reduce((sum, row) => sum + row.allocated_display_earnings_cents, 0)).toBe(
      display.displayEarningsCents,
    );
    expect(legacy.payoutCents + legacy.bonusCents).toBe(display.displayEarningsCents);
    expect(frozen).toBe(display.displayEarningsCents);
    expect(bookingPayableForWeeklyBatch(weeklyRow, new Map())).toEqual({ payable: true });
    expect(weeklyBasisCents(weeklyRow)).toBe(display.displayEarningsCents);
  });

  it("excludes generic checkout adjustments from the line-led cleaner earnings basis", () => {
    const lineItems = withIds(
      buildCheckoutVisitLineItems({
        serviceTypeSlug: "standard",
        job: { serviceBaseZar: 200, roomsZar: 150, extrasZar: 100 },
        subtotalZar: 450,
        visitTotalZar: 500,
      }),
    );

    const lineSubtotalCents = sumEligibleLineItemsSubtotalCents(lineItems);
    const display = displayFromLineSubtotal({ lineSubtotalCents });
    const legacy = legacySoloColumns({
      baseAmountCents: 45_000,
      amountPaidCents: 50_000,
      serviceFeeCents: 5_000,
    });
    const frozen = resolveCleanerFrozenCentsForSettlement({
      display_earnings_cents: display.displayEarningsCents,
      cleaner_payout_cents: legacy.payoutCents,
    });
    const weeklyRow = {
      status: "completed",
      cleaner_id: "cleaner-1",
      cleaner_payout_cents: legacy.payoutCents,
      cleaner_bonus_cents: legacy.bonusCents,
      payment_status: "success",
    };

    expect(lineItems.find((item) => item.item_type === "adjustment")?.total_price_cents).toBe(5_000);
    expect(lineSubtotalCents).toBe(45_000);
    expect(display.displayEarningsCents).toBe(31_500);

    // Phase 2A: generic adjustments no longer silently inflate display/frozen earnings.
    // Weekly payout columns are still based on the existing legacy booking payout fields.
    expect(legacy.payoutCents + legacy.bonusCents).toBe(31_500);
    expect(frozen).toBe(display.displayEarningsCents);
    expect(bookingPayableForWeeklyBatch(weeklyRow, new Map())).toEqual({ payable: true });
    expect(weeklyBasisCents(weeklyRow)).toBe(31_500);
    expect(weeklyBasisCents(weeklyRow)).toBe(display.displayEarningsCents);
  });

  it("keeps recurring/monthly child earnings aligned after settlement freezes the display basis", () => {
    const lineItems = withIds(
      buildMonthlyBundledZarLineItems({
        quotedTotalZar: 700,
        bundleLabel: "Monthly recurring visit",
        extras: [
          { slug: "inside-fridge", name: "Inside fridge", price: 150 },
          { slug: "inside-oven", name: "Inside oven", price: 50 },
        ],
      }),
    );

    const lineSubtotalCents = sumEligibleLineItemsSubtotalCents(lineItems);
    const display = displayFromLineSubtotal({ lineSubtotalCents });
    const legacy = legacySoloColumns({ baseAmountCents: 70_000, amountPaidCents: 70_000 });
    const frozen = resolveCleanerFrozenCentsForSettlement({
      display_earnings_cents: display.displayEarningsCents,
      cleaner_payout_cents: legacy.payoutCents,
    });
    const weeklyRow = {
      status: "completed",
      cleaner_id: "cleaner-1",
      cleaner_payout_cents: legacy.payoutCents,
      cleaner_bonus_cents: legacy.bonusCents,
      billing_type: "recurring_invoice",
      is_monthly_billing_booking: true,
      monthly_invoice_id: "invoice-1",
      payment_status: "success",
      payout_status: "eligible",
      payout_frozen_cents: frozen,
    };

    expect(lineSubtotalCents).toBe(70_000);
    expect(lineItems.filter((item) => item.item_type === "extra")).toHaveLength(2);
    expect(display.displayEarningsCents).toBe(49_000);
    expect(legacy.payoutCents + legacy.bonusCents).toBe(display.displayEarningsCents);
    expect(frozen).toBe(display.displayEarningsCents);
    expect(bookingPayableForWeeklyBatch(weeklyRow, new Map([["invoice-1", "paid"]]))).toEqual({ payable: true });
    expect(weeklyBasisCents(weeklyRow)).toBe(display.displayEarningsCents);
  });

  it("documents the intentional team-job split between booking display, member payouts, and weekly solo payout columns", () => {
    const lineItems = withIds(
      buildCheckoutVisitLineItems({
        serviceTypeSlug: "standard",
        job: { serviceBaseZar: 300, roomsZar: 400, extrasZar: 200 },
        subtotalZar: 900,
        visitTotalZar: 900,
      }),
    );

    const lineSubtotalCents = sumEligibleLineItemsSubtotalCents(lineItems);
    const display = displayFromLineSubtotal({
      lineSubtotalCents,
      isTeamJob: true,
      teamCleanerCount: 3,
    });
    const memberRows = buildTeamJobMemberFixedPerCleanerPayoutRows({
      bookingId: "booking-1",
      teamId: "team-1",
      rosterRows: [
        { cleaner_id: "11111111-1111-4111-8111-111111111111" },
        { cleaner_id: "22222222-2222-4222-8222-222222222222" },
        { cleaner_id: "33333333-3333-4333-8333-333333333333" },
      ],
      fallbackCleanerIds: [],
    });
    const bookingColumns = {
      status: "completed",
      cleaner_id: "11111111-1111-4111-8111-111111111111",
      cleaner_payout_cents: display.cleanerPayoutCents,
      cleaner_bonus_cents: display.cleanerBonusCents,
      payment_status: "success",
    };
    const frozen = resolveCleanerFrozenCentsForSettlement({
      display_earnings_cents: display.displayEarningsCents,
      cleaner_payout_cents: bookingColumns.cleaner_payout_cents,
    });

    expect(lineSubtotalCents).toBe(90_000);
    expect(display.displayEarningsCents).toBe(25_000);
    expect(display.internalEarningsCents).toBe(75_000);
    expect(memberRows.map((row) => row.payout_cents)).toEqual([25_000, 25_000, 25_000]);
    expect(memberRows.reduce((sum, row) => sum + row.payout_cents, 0)).toBe(display.internalEarningsCents);

    // Intentional current divergence: team jobs persist per-cleaner display and team member rows;
    // legacy booking payout columns remain zero, so the solo weekly batch predicate excludes them.
    expect(bookingColumns.cleaner_payout_cents + bookingColumns.cleaner_bonus_cents).toBe(0);
    expect(frozen).toBe(display.displayEarningsCents);
    expect(bookingPayableForWeeklyBatch(bookingColumns, new Map())).toEqual({
      payable: false,
      reason: "missing_cleaner_payout_basis",
    });
  });
});
