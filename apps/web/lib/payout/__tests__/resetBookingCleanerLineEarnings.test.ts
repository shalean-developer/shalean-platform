import { describe, expect, it, vi } from "vitest";
import { resetBookingCleanerLineEarnings } from "@/lib/payout/resetBookingCleanerLineEarnings";

type Row = Record<string, unknown>;

function makeAdmin(bookingStatus: string) {
  const bookingUpdates: Row[] = [];
  let bookingsCalls = 0;

  const from = vi.fn((table: string) => {
    if (table === "bookings") {
      bookingsCalls += 1;
      if (bookingsCalls === 1) {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({ data: { status: bookingStatus }, error: null })),
            })),
          })),
        };
      }

      return {
        update: vi.fn((patch: Row) => {
          bookingUpdates.push(patch);
          return {
            eq: vi.fn(async () => ({ data: [], error: null })),
          };
        }),
      };
    }

    if (table === "booking_line_items") {
      return {
        update: vi.fn(() => ({
          eq: vi.fn(async () => ({ data: [], error: null })),
        })),
      };
    }

    return {
      delete: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(async () => ({ data: [], error: null })),
        })),
      })),
    };
  });

  return { from, bookingUpdates };
}

describe("resetBookingCleanerLineEarnings", () => {
  it("uses 0 display earnings for completed bookings (constraint-safe clear)", async () => {
    const admin = makeAdmin("completed");
    const result = await resetBookingCleanerLineEarnings(admin as never, "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
    expect(result).toEqual({ ok: true });
    expect(admin.bookingUpdates[0]).toMatchObject({
      display_earnings_cents: 0,
      cleaner_earnings_total_cents: 0,
      cleaner_line_earnings_finalized_at: null,
    });
  });

  it("uses null display earnings for non-completed bookings", async () => {
    const admin = makeAdmin("assigned");
    const result = await resetBookingCleanerLineEarnings(admin as never, "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
    expect(result).toEqual({ ok: true });
    expect(admin.bookingUpdates[0]).toMatchObject({
      display_earnings_cents: null,
      cleaner_earnings_total_cents: null,
    });
  });
});
