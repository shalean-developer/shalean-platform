import { beforeEach, describe, expect, it, vi } from "vitest";

const BOOKING_ID = "11111111-1111-4111-8111-111111111111";
const CLEANER_ID = "22222222-2222-4222-8222-222222222222";
const OFFER_ID = "33333333-3333-4333-8333-333333333333";

const logSystemEventMock = vi.fn(async (..._args: unknown[]) => ({ ok: true }));
vi.mock("@/lib/logging/systemLog", () => ({
  logSystemEvent: (...args: unknown[]) => logSystemEventMock(...args),
}));

import { resolveAndPersistDispatchOfferEarningsSnapshot } from "@/lib/dispatch/dispatchOfferEarningsSnapshot";

type BookingRow = Record<string, unknown> | null;
type CleanerRow = Record<string, unknown> | null;

function makeAdmin(opts: {
  booking: BookingRow;
  cleaner: CleanerRow;
  bookingError?: string | null;
  cleanerError?: string | null;
  /** When set, every `update()` call resolves with this error. */
  updateError?: string | null;
}) {
  const updateCalls: Array<{ table: string; payload: Record<string, unknown>; eqId: string; isNullDisplay: boolean }> = [];

  function makeUpdateChain(table: string, payload: Record<string, unknown>) {
    let isNullDisplay = false;
    const chain = {
      eq: vi.fn().mockImplementation((_field: string, value: string) => {
        chain._eqId = value;
        return chain;
      }),
      is: vi.fn().mockImplementation((field: string) => {
        if (field === "display_earnings_cents") isNullDisplay = true;
        return Promise.resolve({ data: null, error: opts.updateError ? { message: opts.updateError } : null }).then(
          (r) => {
            updateCalls.push({ table, payload, eqId: chain._eqId ?? "", isNullDisplay });
            return r;
          },
        );
      }),
      _eqId: undefined as string | undefined,
    };
    /** Path used when `.update().eq("id", ...)` is awaited directly without `.is(...)` (the unresolved-snapshot branch). */
    const finalize = () => {
      updateCalls.push({ table, payload, eqId: chain._eqId ?? "", isNullDisplay });
      return Promise.resolve({ data: null, error: opts.updateError ? { message: opts.updateError } : null });
    };
    Object.assign(chain.eq, { then: undefined });
    /** Make `.eq(...)` directly thenable as well, since the failure path doesn't chain `.is(...)`. */
    const wrappedEq = (field: string, value: string) => {
      chain.eq(field, value);
      return {
        is: chain.is,
        then: (onFulfilled?: (v: unknown) => unknown) => finalize().then(onFulfilled as never),
      };
    };
    return { ...chain, eq: wrappedEq };
  }

  const admin = {
    from: (table: string) => {
      if (table === "bookings") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: opts.booking,
                error: opts.bookingError ? { message: opts.bookingError } : null,
              }),
            }),
          }),
        };
      }
      if (table === "cleaners") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: opts.cleaner,
                error: opts.cleanerError ? { message: opts.cleanerError } : null,
              }),
            }),
          }),
        };
      }
      if (table === "dispatch_offers") {
        return {
          update: (payload: Record<string, unknown>) => makeUpdateChain(table, payload),
        };
      }
      throw new Error(`unexpected table: ${table}`);
    },
  };
  return { admin: admin as unknown as Parameters<typeof resolveAndPersistDispatchOfferEarningsSnapshot>[0]["supabase"], updateCalls };
}

describe("resolveAndPersistDispatchOfferEarningsSnapshot", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("computes and persists a canonical snapshot for a solo standard offer", async () => {
    const { admin, updateCalls } = makeAdmin({
      booking: {
        id: BOOKING_ID,
        service: "Standard cleaning",
        date: "2026-05-15",
        time: "10:00",
        is_team_job: false,
        total_paid_zar: 600,
      },
      cleaner: {
        id: CLEANER_ID,
        joined_at: "2024-01-01T00:00:00.000Z",
      },
    });

    const r = await resolveAndPersistDispatchOfferEarningsSnapshot({
      supabase: admin,
      bookingId: BOOKING_ID,
      cleanerId: CLEANER_ID,
      offerId: OFFER_ID,
    });

    /** Experienced (>= 4 mo) cleaner gets 70% × R600 = R420. */
    expect(r.amountCents).toBe(42_000);
    expect(r.source).toBe("canonical");
    expect(r.missingReason).toBeNull();

    const writes = updateCalls.filter((c) => c.table === "dispatch_offers");
    expect(writes).toHaveLength(1);
    expect(writes[0]!.payload).toMatchObject({ display_earnings_cents: 42_000, earnings_snapshot_source: "canonical" });
    /** Snapshot writes must be guarded by `is null` to never overwrite a positive value. */
    expect(writes[0]!.isNullDisplay).toBe(true);
    expect(writes[0]!.eqId).toBe(OFFER_ID);
  });

  it("writes R250 per cleaner for team jobs without consulting tenure", async () => {
    const { admin, updateCalls } = makeAdmin({
      booking: {
        id: BOOKING_ID,
        service: "Standard cleaning",
        date: "2026-05-15",
        time: "10:00",
        is_team_job: true,
        team_member_count_snapshot: 3,
        total_paid_zar: 600,
      },
      cleaner: { id: CLEANER_ID, joined_at: null, created_at: null },
    });

    const r = await resolveAndPersistDispatchOfferEarningsSnapshot({
      supabase: admin,
      bookingId: BOOKING_ID,
      cleanerId: CLEANER_ID,
      offerId: OFFER_ID,
    });

    expect(r.amountCents).toBe(25_000);
    expect(r.source).toBe("canonical");
    expect(updateCalls[0]!.payload.display_earnings_cents).toBe(25_000);
  });

  it("returns a stable miss source and skips the amount write when solo standard has no payment basis", async () => {
    const { admin, updateCalls } = makeAdmin({
      booking: {
        id: BOOKING_ID,
        service: "Standard cleaning",
        date: "2026-05-15",
        time: "10:00",
        is_team_job: false,
        total_paid_zar: null,
        total_paid_cents: 0,
        base_amount_cents: 0,
      },
      cleaner: { id: CLEANER_ID, joined_at: "2024-01-01T00:00:00.000Z" },
    });

    const r = await resolveAndPersistDispatchOfferEarningsSnapshot({
      supabase: admin,
      bookingId: BOOKING_ID,
      cleanerId: CLEANER_ID,
      offerId: OFFER_ID,
    });

    expect(r.amountCents).toBeNull();
    expect(r.source).toBe("missing_payment_basis");
    expect(r.missingReason).toBe("solo_standard_without_payment_basis");

    /** On a miss we still persist the diagnostic source so the audit query can group these. We do NOT write display_earnings_cents. */
    const write = updateCalls.find((c) => c.table === "dispatch_offers");
    expect(write).toBeDefined();
    expect(write!.payload).toHaveProperty("earnings_snapshot_source", "missing_payment_basis");
    expect(write!.payload).not.toHaveProperty("display_earnings_cents");

    const warnLog = (logSystemEventMock.mock.calls ?? [])
      .map((c) => c[0] as { source?: string })
      .find((c) => c?.source === "dispatch_offer_earnings_snapshot_unresolved");
    expect(warnLog).toBeDefined();
  });

  it("logs a warning and returns missing_inputs when the booking row is unreadable", async () => {
    const { admin, updateCalls } = makeAdmin({
      booking: null,
      cleaner: { id: CLEANER_ID, joined_at: "2024-01-01T00:00:00.000Z" },
      bookingError: "permission_denied",
    });

    const r = await resolveAndPersistDispatchOfferEarningsSnapshot({
      supabase: admin,
      bookingId: BOOKING_ID,
      cleanerId: CLEANER_ID,
      offerId: OFFER_ID,
    });

    expect(r.amountCents).toBeNull();
    expect(r.source).toBe("missing_inputs");
    expect(updateCalls).toHaveLength(0);
    const warnLog = (logSystemEventMock.mock.calls ?? [])
      .map((c) => c[0] as { source?: string })
      .find((c) => c?.source === "dispatch_offer_earnings_snapshot_inputs_missing");
    expect(warnLog).toBeDefined();
  });
});
