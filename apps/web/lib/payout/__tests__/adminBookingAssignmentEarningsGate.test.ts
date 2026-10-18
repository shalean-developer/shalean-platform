import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  adminBookingBeforeAssignmentPatchSelectList,
  bookingPaidCustomerSignalsPresent,
  bookingRequiresPersistedEarningsBeforeCleanerNotify,
  loadAdminBookingBeforeAssignmentPatch,
} from "@/lib/payout/adminBookingAssignmentEarningsGate";
import { isCurrentPayoutVisitDate } from "@/lib/payout/payoutProcessingCutoff";

function readClient(result: { data: unknown; error: unknown } | Error) {
  let projection = "";
  const query = {
    select(columns: string) {
      projection = columns;
      return query;
    },
    eq() {
      return query;
    },
    async maybeSingle() {
      // Reproduce the deployed schema: this retired column does not exist.
      if (projection.split(",").some((c) => c.trim() === "user_id")) {
        return {
          data: null,
          error: { message: "column bookings.user_id does not exist" },
        };
      }
      if (result instanceof Error) throw result;
      return result;
    },
  };
  return {
    client: { from: () => query } as unknown as SupabaseClient,
    projection: () => projection,
  };
}

function projectedBooking(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    ...Object.fromEntries(
      adminBookingBeforeAssignmentPatchSelectList()
        .split(",")
        .map((c) => [c.trim(), null]),
    ),
    status: "assigned",
    dispatch_status: "assigned",
    billing_type: "recurring_invoice",
    is_team_job: false,
    is_recurring_generated: false,
    amount_paid_cents: 0,
    service_fee_cents: 0,
    metadata: {},
    ...overrides,
  };
}

describe("admin pre-update booking read", () => {
  it.each(["not a booking row", [], {}, { date: "2026-10-06" }])(
    "rejects an unexpected successful response shape",
    async (data) => {
      const mock = readClient({ data, error: null });
      expect(
        await loadAdminBookingBeforeAssignmentPatch(mock.client, "booking"),
      ).toMatchObject({ ok: false, status: 503, code: "booking_read_failed" });
    },
  );
  it.each(["date", "status", "display_earnings_cents", "refunded_at"])(
    "rejects a partial before-image missing %s",
    async (field) => {
      const row = projectedBooking({
        date: "2026-10-06",
        display_earnings_cents: 30000,
      });
      delete row[field];
      const mock = readClient({ data: row, error: null });
      expect(
        await loadAdminBookingBeforeAssignmentPatch(mock.client, "booking"),
      ).toMatchObject({ ok: false, status: 503, code: "booking_read_failed" });
    },
  );
  it.each([
    { status: {} },
    { status: null },
    { status: " " },
    { date: 20261006 },
    { display_earnings_cents: "30000" },
    { is_team_job: "false" },
    { display_earnings_cents: Number.NaN },
  ])("rejects an incorrectly typed before-image", async (overrides) => {
    const mock = readClient({ data: projectedBooking(overrides), error: null });
    expect(
      await loadAdminBookingBeforeAssignmentPatch(mock.client, "booking"),
    ).toMatchObject({ ok: false, status: 503, code: "booking_read_failed" });
  });
  it("loads a current visit on the schema without the retired customer column", async () => {
    const row = projectedBooking({
      date: "2026-10-06",
      display_earnings_cents: 30000,
    });
    const mock = readClient({ data: row, error: null });
    const result = await loadAdminBookingBeforeAssignmentPatch(
      mock.client,
      "booking",
    );
    expect(result).toEqual({ ok: true, booking: row });
    expect(
      isCurrentPayoutVisitDate(result.ok ? String(result.booking.date) : null),
    ).toBe(true);
    for (const field of [
      "date",
      "display_earnings_cents",
      "paid_at",
      "refunded_at",
      "refund_status",
    ]) {
      expect(
        mock
          .projection()
          .split(",")
          .map((c) => c.trim()),
      ).toContain(field);
    }
  });
  it.each([false, true])(
    "fails closed on a database read failure instead of inventing a historical visit (throws: %s)",
    async (throws) => {
      const mock = readClient(
        throws
          ? new Error("Private database detail")
          : { data: null, error: { message: "Private database detail" } },
      );
      const result = await loadAdminBookingBeforeAssignmentPatch(
        mock.client,
        "booking",
      );
      expect(result).toMatchObject({
        ok: false,
        status: 503,
        code: "booking_read_failed",
      });
      expect(JSON.stringify(result)).not.toMatch(
        /Private database detail|historical_payout_item_deferred/,
      );
    },
  );
  it("distinguishes a missing booking from a failed read", async () => {
    const mock = readClient({ data: null, error: null });
    expect(
      await loadAdminBookingBeforeAssignmentPatch(mock.client, "missing"),
    ).toMatchObject({ ok: false, status: 404, code: "booking_not_found" });
  });
  it("preserves a real historical date and missing amount for the existing cutoff checks", async () => {
    const row = projectedBooking({
      date: "2026-09-15",
      display_earnings_cents: null,
    });
    const mock = readClient({ data: row, error: null });
    const result = await loadAdminBookingBeforeAssignmentPatch(
      mock.client,
      "old",
    );
    expect(result).toEqual({ ok: true, booking: row });
    expect(
      isCurrentPayoutVisitDate(result.ok ? String(result.booking.date) : null),
    ).toBe(false);
  });
});

describe("bookingRequiresPersistedEarningsBeforeCleanerNotify", () => {
  it("is true for paid prepaid solo assigned booking", () => {
    expect(
      bookingRequiresPersistedEarningsBeforeCleanerNotify({
        is_team_job: false,
        billing_type: "prepaid",
        status: "assigned",
        total_paid_zar: null,
        total_paid_cents: 50_000,
        amount_paid_cents: 50_000,
        payment_status: "paid",
      }),
    ).toBe(true);
  });

  it("is false for team jobs", () => {
    expect(
      bookingRequiresPersistedEarningsBeforeCleanerNotify({
        is_team_job: true,
        billing_type: "prepaid",
        status: "assigned",
        total_paid_cents: 50_000,
        payment_status: "paid",
      }),
    ).toBe(false);
  });

  it("is false when no paid customer signal", () => {
    expect(
      bookingRequiresPersistedEarningsBeforeCleanerNotify({
        is_team_job: false,
        billing_type: "prepaid",
        status: "assigned",
        total_paid_cents: null,
        amount_paid_cents: null,
        payment_status: null,
      }),
    ).toBe(false);
  });
});

describe("bookingPaidCustomerSignalsPresent", () => {
  it("detects amount_paid_cents on non-pending rows", () => {
    expect(
      bookingPaidCustomerSignalsPresent({
        status: "assigned",
        total_paid_zar: null,
        total_paid_cents: null,
        amount_paid_cents: 100,
      }),
    ).toBe(true);
  });

  it("ignores positive cents on pending_payment", () => {
    expect(
      bookingPaidCustomerSignalsPresent({
        status: "pending_payment",
        payment_status: "pending",
        amount_paid_cents: 12_000,
      }),
    ).toBe(false);
  });
});
