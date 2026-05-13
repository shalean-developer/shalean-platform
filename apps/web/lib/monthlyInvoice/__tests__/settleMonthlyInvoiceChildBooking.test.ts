import { describe, expect, it } from "vitest";

import { settleMonthlyInvoiceChildBooking } from "@/lib/monthlyInvoice/settleMonthlyInvoiceChildBooking";

describe("settleMonthlyInvoiceChildBooking", () => {
  it("delegates to the existing child booking settlement update shape", async () => {
    const calls: Array<{ table: string; patch: Record<string, unknown>; filters: Array<[string, unknown]> }> = [];
    const admin = {
      from(table: string) {
        return {
          update(patch: Record<string, unknown>) {
            const call = { table, patch, filters: [] as Array<[string, unknown]> };
            calls.push(call);
            return {
              eq: async (column: string, value: unknown) => {
                call.filters.push([column, value]);
                return { error: null };
              },
            };
          },
        };
      },
    };

    const result = await settleMonthlyInvoiceChildBooking(admin as never, {
      bookingId: "booking-1",
      amountPaidCents: 12345,
      payoutFrozenCents: 6789,
    });

    expect(result).toEqual({ ok: true });
    expect(calls).toEqual([
      {
        table: "bookings",
        patch: {
          payment_status: "success",
          amount_paid_cents: 12345,
          payout_status: "eligible",
          payout_frozen_cents: 6789,
        },
        filters: [["id", "booking-1"]],
      },
    ]);
  });

  it("returns the underlying update error without changing caller behavior", async () => {
    const admin = {
      from() {
        return {
          update() {
            return {
              eq: async () => ({ error: { message: "db failed" } }),
            };
          },
        };
      },
    };

    await expect(
      settleMonthlyInvoiceChildBooking(admin as never, {
        bookingId: "booking-2",
        amountPaidCents: 1,
        payoutFrozenCents: 2,
      }),
    ).resolves.toEqual({ ok: false, error: "db failed" });
  });

  it.each([
    ["zero", 0],
    ["negative", -1],
    ["NaN", Number.NaN],
    ["infinity", Number.POSITIVE_INFINITY],
  ])("blocks %s payout_frozen_cents before marking the child booking payout eligible", async (_label, payoutFrozenCents) => {
    let updateCalled = false;
    const admin = {
      from() {
        return {
          update() {
            updateCalled = true;
            return {
              eq: async () => ({ error: null }),
            };
          },
        };
      },
    };

    const result = await settleMonthlyInvoiceChildBooking(admin as never, {
      bookingId: "booking-unsafe",
      amountPaidCents: 1000,
      payoutFrozenCents,
    });

    expect(result).toEqual({ ok: false, error: "invalid_payout_frozen_cents:booking-unsafe" });
    expect(updateCalled).toBe(false);
  });
});
