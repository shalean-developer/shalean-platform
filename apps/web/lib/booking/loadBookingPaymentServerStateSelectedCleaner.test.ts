import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const PRINCESS_ID = "11111111-1111-4111-8111-111111111111";
const BOOKING_ID = "ba000000-0000-4000-8000-00000000beef";

type MaybeSingle<T> = Promise<{ data: T | null; error: null }>;

/**
 * Minimal mock of the Supabase admin client surface used by `loadBookingPaymentServerState`.
 * Returns `bookings` row with `selected_cleaner_id` but no snapshot `cleaner_name`,
 * and `cleaners` row with `full_name = "Princess Saidi"`.
 */
function makeAdminClientFor({
  bookingRow,
  cleanerRow,
}: {
  bookingRow: Record<string, unknown> | null;
  cleanerRow: { full_name?: string | null } | null;
}) {
  return {
    from(table: string) {
      if (table === "bookings") {
        return {
          select() {
            return {
              eq() {
                return {
                  maybeSingle: () => Promise.resolve({ data: bookingRow, error: null }) as MaybeSingle<typeof bookingRow>,
                };
              },
            };
          },
        };
      }
      if (table === "cleaners") {
        return {
          select() {
            return {
              eq() {
                return {
                  maybeSingle: () => Promise.resolve({ data: cleanerRow, error: null }) as MaybeSingle<typeof cleanerRow>,
                };
              },
            };
          },
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    },
  };
}

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("loadBookingPaymentServerState — selected cleaner fallback resolution", () => {
  it("resolves the cleaner full_name when the snapshot lacks cleaner_name", async () => {
    vi.doMock("@/lib/supabase/admin", () => ({
      getSupabaseAdmin: () =>
        makeAdminClientFor({
          bookingRow: {
            id: BOOKING_ID,
            customer_email: "c1@example.com",
            service: "standard-cleaning",
            rooms: 2,
            bathrooms: 1,
            extras: [],
            total_price: 800,
            total_paid_zar: 800,
            status: "pending_payment",
            booking_snapshot: { v: 1 },
            payment_completed_at: null,
            selected_cleaner_id: PRINCESS_ID,
          },
          cleanerRow: { full_name: "Princess Saidi" },
        }),
    }));
    const { loadBookingPaymentServerState } = await import("@/lib/booking/loadBookingPaymentServerState");
    const out = await loadBookingPaymentServerState(BOOKING_ID);
    expect(out.status).toBe("ready");
    if (out.status === "ready") {
      expect(out.summary.cleanerName).toBe("Princess Saidi");
    }
  });

  it("uses 'Selected cleaner' when selected_cleaner_id is set but the cleaner row is missing", async () => {
    vi.doMock("@/lib/supabase/admin", () => ({
      getSupabaseAdmin: () =>
        makeAdminClientFor({
          bookingRow: {
            id: BOOKING_ID,
            customer_email: "c1@example.com",
            service: "standard-cleaning",
            rooms: 2,
            bathrooms: 1,
            extras: [],
            total_price: 800,
            total_paid_zar: 800,
            status: "pending_payment",
            booking_snapshot: { v: 1 },
            payment_completed_at: null,
            selected_cleaner_id: PRINCESS_ID,
          },
          cleanerRow: null,
        }),
    }));
    const { loadBookingPaymentServerState } = await import("@/lib/booking/loadBookingPaymentServerState");
    const out = await loadBookingPaymentServerState(BOOKING_ID);
    expect(out.status).toBe("ready");
    if (out.status === "ready") {
      expect(out.summary.cleanerName).toBe("Selected cleaner");
    }
  });

  it("preserves the snapshot cleaner_name when already present (no DB lookup needed)", async () => {
    vi.doMock("@/lib/supabase/admin", () => ({
      getSupabaseAdmin: () =>
        makeAdminClientFor({
          bookingRow: {
            id: BOOKING_ID,
            customer_email: "c1@example.com",
            service: "standard-cleaning",
            rooms: 2,
            bathrooms: 1,
            extras: [],
            total_price: 800,
            total_paid_zar: 800,
            status: "pending_payment",
            booking_snapshot: { v: 1, cleaner_name: "Princess Saidi" },
            payment_completed_at: null,
            selected_cleaner_id: PRINCESS_ID,
          },
          /** Should not be queried; assert via throw if it were. */
          cleanerRow: { full_name: "WRONG" },
        }),
    }));
    const { loadBookingPaymentServerState } = await import("@/lib/booking/loadBookingPaymentServerState");
    const out = await loadBookingPaymentServerState(BOOKING_ID);
    expect(out.status).toBe("ready");
    if (out.status === "ready") {
      expect(out.summary.cleanerName).toBe("Princess Saidi");
    }
  });

  it("returns null cleanerName when no cleaner is selected (auto-assign path)", async () => {
    vi.doMock("@/lib/supabase/admin", () => ({
      getSupabaseAdmin: () =>
        makeAdminClientFor({
          bookingRow: {
            id: BOOKING_ID,
            customer_email: "c1@example.com",
            service: "standard-cleaning",
            rooms: 2,
            bathrooms: 1,
            extras: [],
            total_price: 800,
            total_paid_zar: 800,
            status: "pending_payment",
            booking_snapshot: { v: 1 },
            payment_completed_at: null,
            selected_cleaner_id: null,
          },
          cleanerRow: null,
        }),
    }));
    const { loadBookingPaymentServerState } = await import("@/lib/booking/loadBookingPaymentServerState");
    const out = await loadBookingPaymentServerState(BOOKING_ID);
    expect(out.status).toBe("ready");
    if (out.status === "ready") {
      expect(out.summary.cleanerName).toBeNull();
    }
  });
});
