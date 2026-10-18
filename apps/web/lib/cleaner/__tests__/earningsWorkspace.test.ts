import { describe, expect, it } from "vitest";
import {
  buildEarningsWorkspace,
  type WorkspaceBooking,
  type WorkspaceBatch,
} from "@/lib/cleaner/buildEarningsWorkspace";
import {
  earningsDateLabel,
  earningsWorkspaceSchema,
} from "@/lib/cleaner/earningsWorkspaceContract";

import { buildBookingEarningsSummary } from "@/lib/payout/bookingEarningsSummary";
const cleanerId = "11111111-1111-4111-8111-111111111111";
function booking(
  id = "11111111-0000-4000-8000-000000000001",
  date = "2026-10-15",
  amount: number | null = 26000,
): WorkspaceBooking {
  return {
    id,
    date,
    service: "Regular cleaning",
    completed_at: `${date}T12:00:00Z`,
    cleaner_id: cleanerId,
    payout_owner_cleaner_id: cleanerId,
    payout_id: null,
    payout_status: "pending",
    display_earnings_cents: amount,
  };
}
function batch(id: string, paid_at: string, amount = 25000): WorkspaceBatch {
  return {
    id,
    total_amount_cents: amount,
    status: "paid",
    payment_status: "success",
    payment_method: "bank_transfer",
    payment_reference: `Bank ${id}`,
    paid_at,
    period_start: "2026-10-01",
    period_end: "2026-10-31",
  };
}
const base = {
  cleanerId,
  bookings: [] as WorkspaceBooking[],
  teamMembers: [],
  rosterMembers: [],
  batches: [] as WorkspaceBatch[],
  disbursements: [],
  bankReady: true,
  month: "2026-10",
  now: new Date("2026-10-18T21:00:00Z"),
};

describe("earnings workspace financial presentation", () => {
  it("retains approved October amounts, visit dates and roster-member allocation including zero", () => {
    const rows = [
      booking("a", "2026-10-01"),
      booking("b", "2026-10-05"),
      booking("c", "2026-10-08"),
      booking("d", "2026-10-12"),
      booking("e", "2026-10-15"),
    ];
    const result = buildEarningsWorkspace({ ...base, bookings: rows });
    expect(result.period.earned_cents).toBe(130000);
    expect(result.week_cents).toBe(52000);
    expect(result.today_cents).toBe(0);
    expect(result.period.completed_visits).toBe(5);
    const member = buildEarningsWorkspace({
      ...base,
      bookings: [
        {
          ...booking(),
          display_earnings_cents: 28000,
          payout_status: "paid",
          payout_id: "lead-bank",
        },
      ],
      rosterMembers: [
        {
          booking_id: booking().id,
          payout_cents: 0,
          bonus_cents: 0,
          status: "pending",
          cleaner_payout_id: null,
        },
      ],
      batches: [batch("lead-bank", "2026-10-16T12:00:00Z")],
    });
    expect(member.earnings[0].amount_cents).toBe(0);
    expect(member.earnings[0].state).toBe("month_open");
    const approved = buildEarningsWorkspace({
      ...base,
      bookings: [
        booking("solo252", "2026-10-08", 25200),
        booking("solo280", "2026-10-08", 28000),
      ],
    });
    expect(approved.period.earned_cents).toBe(53200);
  });

  it("does not manufacture paid history from a pre-July pending or eligible job", () => {
    const rows = [
      { ...booking("old", "2026-06-15"), payout_status: "eligible" },
    ];
    const result = buildEarningsWorkspace({
      ...base,
      bookings: rows,
      month: "2026-06",
    });
    expect(result.earnings[0].state).toBe("historical_review");
    expect(result.payments).toEqual([]);
    expect(result.period.recorded_payments_cents).toBe(0);
    expect(JSON.stringify(result)).not.toContain("000610450001");
  });

  it("totals all 21 settlement records independently of the visible history page", () => {
    const result = buildEarningsWorkspace({
      ...base,
      batches: Array.from({ length: 21 }, (_, i) =>
        batch(String(i), "2026-10-18T12:00:00Z"),
      ),
    });
    expect(result.period.recorded_payments_cents).toBe(525000);
    expect(result.payments).toHaveLength(21);
  });

  it("uses Johannesburg payment instants at both month boundaries and distinguishes earning period", () => {
    const result = buildEarningsWorkspace({
      ...base,
      batches: [
        batch("first", "2026-09-30T22:30:00Z"),
        batch("next", "2026-10-31T22:30:00Z"),
      ],
    });
    expect(result.period.recorded_payments_cents).toBe(25000);
    expect(result.payments.map((p) => p.id)).toEqual(["batch-first"]);
    expect(earningsDateLabel("2026-09-30T22:30:00Z", true)).toContain("1 Oct");
    expect(earningsDateLabel("2026-10-31T22:30:00Z", true)).toContain("1 Nov");
    const november = buildEarningsWorkspace({
      ...base,
      month: "2026-11",
      batches: [batch("next", "2026-10-31T22:30:00Z")],
    });
    expect(november.period.recorded_payments_cents).toBe(25000);
    expect(november.payments[0].earning_period).toBe("2026-10");
  });

  it("counts all 601 visits once, with complete lifetime and selected-month totals", () => {
    const rows = Array.from({ length: 601 }, (_, i) => booking(String(i)));
    const result = buildEarningsWorkspace({
      ...base,
      bookings: [...rows, rows[0]],
    });
    expect(result.lifetime.completed_visits).toBe(601);
    expect(result.lifetime.earned_cents).toBe(601 * 26000);
    expect(result.period.completed_visits).toBe(601);
    expect(result.earnings).toHaveLength(601);
  });

  it("distinguishes unknown from legitimate zero and rejects a partial response contract", () => {
    const unknown = buildEarningsWorkspace({
      ...base,
      bookings: [booking("unknown", "2026-10-15", null)],
    });
    expect(unknown.period.earned_cents).toBeNull();
    expect(unknown.lifetime.earned_cents).toBeNull();
    expect(unknown.period.unavailable_visits).toBe(1);
    const zero = buildEarningsWorkspace({
      ...base,
      bookings: [booking("zero", "2026-10-15", 0)],
    });
    expect(zero.period.earned_cents).toBe(0);
    expect(earningsWorkspaceSchema.safeParse({ version: 1 }).success).toBe(
      false,
    );
    expect(
      earningsWorkspaceSchema.safeParse({ ...zero, period: {} }).success,
    ).toBe(false);
  });

  it("shows preparing/approved/failed batches and excludes unsupported paid claims", () => {
    const result = buildEarningsWorkspace({
      ...base,
      batches: [
        { ...batch("prep", "2026-10-18T12:00:00Z"), status: "frozen" },
        {
          ...batch("approved", "2026-10-18T12:00:00Z"),
          status: "approved",
          payment_status: "failed",
        },
        {
          ...batch("unsupported", "2026-10-18T12:00:00Z"),
          payment_reference: null,
        },
      ],
      bankReady: false,
    });
    expect(result.period.preparing_cents).toBe(25000);
    expect(result.period.approved_cents).toBe(25000);
    expect(result.period.payment_issue_count).toBe(1);
    expect(result.period.payment_review_count).toBe(1);
    expect(result.payments).toEqual([]);
    expect(result.bank_details_ready).toBe(false);
  });

  it("holds conflicting receipt totals for review without deleting either record", () => {
    const first = batch("one", "2026-10-18T12:00:00Z");
    const result = buildEarningsWorkspace({
      ...base,
      batches: [first, { ...first, id: "two" }],
    });
    expect(result.period.recorded_payments_cents).toBeNull();
    expect(result.payments).toHaveLength(2);
    expect(result.period.payment_review_count).toBe(1);
  });
  it("does not assign an undated payment to its earning month or turn it into a monthly zero claim", () => {
    const result = buildEarningsWorkspace({
      ...base,
      batches: [{ ...batch("undated", "2026-10-18T12:00:00Z"), paid_at: null }],
    });
    expect(result.unassigned_payment_records).toBe(1);
    expect(result.period.payment_review_count).toBe(0);
    expect(result.payments).toEqual([]);
  });
  it("shows failed transfers, undated visits and formal-team precedence", () => {
    const job = booking();
    const result = buildEarningsWorkspace({
      ...base,
      bookings: [
        job,
        { ...booking("undated"), date: null, completed_at: null },
      ],
      teamMembers: [
        {
          booking_id: job.id,
          payout_cents: 27000,
          status: "pending",
          cleaner_payout_id: null,
        },
      ],
      rosterMembers: [
        {
          booking_id: job.id,
          payout_cents: 26000,
          status: "pending",
          cleaner_payout_id: null,
        },
      ],
      disbursements: [
        {
          id: "failed",
          status: "failed",
          total_amount_cents: 25000,
          paid_at: null,
          paystack_reference: null,
          transfer_code: null,
          paystack_transfer_code: null,
          created_at: "2026-10-15T12:00:00Z",
        },
      ],
    });
    expect(result.earnings[0].amount_cents).toBe(27000);
    expect(result.period.payment_issue_count).toBe(1);
    expect(result.undated_visits).toBe(1);
    expect(result.lifetime.completed_visits).toBe(2);
  });
  it("exposes only a consistent viewer-specific base/bonus/deduction breakdown", () => {
    const summary = buildBookingEarningsSummary({
      serviceType: "standard",
      customerTotalCents: 65000,
      eligibleAmountCents: 65000,
      isTeamJob: false,
      participantCleanerIds: [cleanerId],
      perCleanerBaseCents: new Map([[cleanerId, 26000]]),
      adjustments: [
        { cleaner_id: cleanerId, amount_cents: 1000, type: "bonus" },
        { cleaner_id: cleanerId, amount_cents: -2000, type: "deduction" },
      ],
      tenureMonths: null,
      cleanerPercentage: null,
      fixedServicePayoutApplied: true,
      minimumEarningCents: 0,
      maximumEarningCents: 65000,
    });
    const result = buildEarningsWorkspace({
      ...base,
      bookings: [{ ...booking(), earnings_summary: summary }],
    });
    expect(result.earnings[0]).toMatchObject({
      amount_cents: 25000,
      base_cents: 26000,
      bonus_cents: 1000,
      deduction_cents: 2000,
    });
    const changed = buildEarningsWorkspace({
      ...base,
      bookings: [{ ...booking(), earnings_summary: summary }],
      rosterMembers: [
        {
          booking_id: booking().id,
          payout_cents: 20000,
          bonus_cents: 0,
          status: "pending",
          cleaner_payout_id: null,
        },
      ],
    });
    expect(changed.earnings[0]).toMatchObject({
      amount_cents: 20000,
      base_cents: null,
      bonus_cents: 0,
      deduction_cents: null,
    });
  });
  it("retains actual historical settlement records and does not expose other participant data", () => {
    const result = buildEarningsWorkspace({
      ...base,
      month: "2026-06",
      bookings: [booking("old", "2026-06-15")],
      batches: [
        {
          ...batch("real", "2026-06-20T12:00:00Z"),
          period_start: "2026-06-01",
          period_end: "2026-06-30",
        },
      ],
    });
    expect(result.payments[0].reference).toBe("Bank real");
    expect(result.earnings[0].state).toBe("historical_review");
    expect(JSON.stringify(result)).not.toMatch(
      /cleaner_id|earnings_summary|customer|account_number|internal_earnings/,
    );
  });
});
