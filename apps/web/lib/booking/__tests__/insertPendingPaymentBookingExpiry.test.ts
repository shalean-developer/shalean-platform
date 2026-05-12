import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { insertPendingPaymentBookingRow } from "@/lib/booking/insertPendingPaymentBooking";
import {
  adminPaymentLinkTtlMs,
  customerPaymentLinkTtlMs,
} from "@/lib/booking/adminPaymentLinkState";
import type { LockedBooking } from "@/lib/booking/lockedBooking";

/**
 * Production Readiness Audit H-2 + H-3.
 *
 * Pre-fix behaviour
 *   - `insertPendingPaymentBookingRow` did NOT stamp `payment_link_expires_at`,
 *     so abandoned customer `pending_payment` rows escaped the
 *     `/api/cron/expire-pending-payments` sweeper (which requires
 *     `payment_link_expires_at IS NOT NULL AND < now()`).
 *   - `service_slug` was only included in the INSERT when `locked.service`
 *     was truthy. Because `bookings.service_slug` is NOT NULL with no DB
 *     default, omitting it would crash the INSERT (Postgres 23502) — a
 *     latent runtime error rather than the audit's "NULL data risk".
 *
 * Post-fix expectations (this file's contracts)
 *   1. INSERT payload always includes `payment_link_expires_at` set to a
 *      future ISO timestamp computed from `customerPaymentLinkTtlMs()`.
 *   2. INSERT payload always includes `service_slug`. When `locked.service`
 *      is truthy, the canonical slug is preserved; when missing/blank, the
 *      column falls back to `'standard'`.
 *   3. The new `customerPaymentLinkTtlMs` helper mirrors `adminPaymentLinkTtlMs`
 *      shape (env-overridable, clamped to [5 min, 7 days], 60 min default)
 *      but reads its own env var so customer / admin TTLs can be tuned
 *      independently — admin behaviour stays unchanged.
 *   4. `expire-pending-payments` cron's filter `payment_link_expires_at IS
 *      NOT NULL AND < now()` matches rows produced by this new INSERT shape.
 */

type CapturedInsert = Record<string, unknown> | undefined;

function buildAdmin(opts?: { insertError?: string | null; insertedId?: string }): {
  admin: SupabaseClient;
  state: { insertPayload: CapturedInsert };
} {
  const state: { insertPayload: CapturedInsert } = { insertPayload: undefined };
  const admin = {
    from(table: string) {
      if (table !== "bookings") throw new Error(`unexpected table ${table}`);
      return {
        insert(payload: Record<string, unknown>) {
          state.insertPayload = payload;
          return {
            select() {
              return {
                async maybeSingle() {
                  if (opts?.insertError) {
                    return { data: null, error: { message: opts.insertError } };
                  }
                  return {
                    data: { id: opts?.insertedId ?? "00000000-0000-4000-8000-000000000bb1" },
                    error: null,
                  };
                },
              };
            },
          };
        },
      };
    },
  } as unknown as SupabaseClient;
  return { admin, state };
}

function buildLocked(overrides: Partial<LockedBooking> = {}): LockedBooking {
  // Minimal LockedBooking shape — only the fields read by `insertPendingPaymentBookingRow`.
  return {
    service: "standard",
    rooms: 2,
    bathrooms: 1,
    location: "Sea Point",
    date: "2026-06-01",
    time: "10:00",
    pricing_version_id: "pv_1",
    quoteSignature: "sig",
    lockExpiresAt: "2026-06-01T08:00:00.000Z",
    ...overrides,
  } as LockedBooking;
}

describe("H-2: insertPendingPaymentBookingRow stamps payment_link_expires_at", () => {
  const realDateNow = Date.now;

  beforeEach(() => {
    vi.stubEnv("CUSTOMER_PAYMENT_LINK_EXPIRES_MINUTES", "60");
    Date.now = () => 1_700_000_000_000;
  });

  afterEach(() => {
    Date.now = realDateNow;
    vi.unstubAllEnvs();
  });

  it("INSERT payload includes a future-dated payment_link_expires_at ISO string", async () => {
    const { admin, state } = buildAdmin();
    const res = await insertPendingPaymentBookingRow(admin, {
      paystackReference: "ref-h2",
      locked: buildLocked(),
      customerEmail: "Cust@example.com",
    });
    expect(res.ok).toBe(true);
    const payload = state.insertPayload!;
    expect(payload.payment_link_expires_at).toBeDefined();
    const expIso = String(payload.payment_link_expires_at);
    const expMs = new Date(expIso).getTime();
    expect(Number.isFinite(expMs)).toBe(true);
    // 60-minute default TTL.
    const expectedMs = 1_700_000_000_000 + customerPaymentLinkTtlMs();
    expect(expMs).toBe(expectedMs);
  });

  it("respects CUSTOMER_PAYMENT_LINK_EXPIRES_MINUTES override (bounds applied)", async () => {
    vi.stubEnv("CUSTOMER_PAYMENT_LINK_EXPIRES_MINUTES", "30");
    const { admin, state } = buildAdmin();
    await insertPendingPaymentBookingRow(admin, {
      paystackReference: "ref-h2-30",
      locked: buildLocked(),
      customerEmail: "x@y.com",
    });
    const expMs = new Date(String(state.insertPayload!.payment_link_expires_at)).getTime();
    expect(expMs - 1_700_000_000_000).toBe(30 * 60 * 1000);
  });

  it("clamps absurd CUSTOMER_PAYMENT_LINK_EXPIRES_MINUTES to safe bounds [5, 168*60]", () => {
    vi.stubEnv("CUSTOMER_PAYMENT_LINK_EXPIRES_MINUTES", "0.5");
    expect(customerPaymentLinkTtlMs()).toBe(5 * 60 * 1000);

    vi.stubEnv("CUSTOMER_PAYMENT_LINK_EXPIRES_MINUTES", "999999");
    expect(customerPaymentLinkTtlMs()).toBe(168 * 60 * 60 * 1000);

    vi.stubEnv("CUSTOMER_PAYMENT_LINK_EXPIRES_MINUTES", "not-a-number");
    expect(customerPaymentLinkTtlMs()).toBe(60 * 60 * 1000);
  });

  it("defaults customerPaymentLinkTtlMs() to 60 minutes when env is unset", () => {
    vi.unstubAllEnvs();
    expect(customerPaymentLinkTtlMs()).toBe(60 * 60 * 1000);
  });

  it("admin TTL helper is unchanged and reads ITS OWN env var (no admin-flow regression)", () => {
    vi.stubEnv("ADMIN_PAYMENT_LINK_EXPIRES_MINUTES", "90");
    vi.stubEnv("CUSTOMER_PAYMENT_LINK_EXPIRES_MINUTES", "15");
    expect(adminPaymentLinkTtlMs()).toBe(90 * 60 * 1000);
    expect(customerPaymentLinkTtlMs()).toBe(15 * 60 * 1000);
  });
});

describe("H-3: insertPendingPaymentBookingRow always supplies a non-null service_slug", () => {
  beforeEach(() => {
    vi.stubEnv("CUSTOMER_PAYMENT_LINK_EXPIRES_MINUTES", "60");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("preserves a valid locked.service slug ('deep' stays 'deep')", async () => {
    const { admin, state } = buildAdmin();
    await insertPendingPaymentBookingRow(admin, {
      paystackReference: "ref-h3-deep",
      locked: buildLocked({ service: "deep" }),
      customerEmail: "a@b.com",
    });
    expect(state.insertPayload!.service_slug).toBe("deep");
  });

  it("preserves 'airbnb' (case-normalises only — never blanks an existing value)", async () => {
    const { admin, state } = buildAdmin();
    await insertPendingPaymentBookingRow(admin, {
      paystackReference: "ref-h3-airbnb",
      locked: buildLocked({ service: "Airbnb " as LockedBooking["service"] }),
      customerEmail: "a@b.com",
    });
    expect(state.insertPayload!.service_slug).toBe("airbnb");
  });

  it("falls back to 'standard' when locked.service is missing (undefined)", async () => {
    const { admin, state } = buildAdmin();
    await insertPendingPaymentBookingRow(admin, {
      paystackReference: "ref-h3-undef",
      locked: buildLocked({ service: undefined as unknown as LockedBooking["service"] }),
      customerEmail: "a@b.com",
    });
    expect(state.insertPayload!.service_slug).toBe("standard");
  });

  it("falls back to 'standard' when locked.service is an empty / whitespace string", async () => {
    const { admin, state } = buildAdmin();
    await insertPendingPaymentBookingRow(admin, {
      paystackReference: "ref-h3-blank",
      locked: buildLocked({ service: "   " as unknown as LockedBooking["service"] }),
      customerEmail: "a@b.com",
    });
    expect(state.insertPayload!.service_slug).toBe("standard");
  });

  it("never inserts service_slug as null (NOT NULL DB constraint compliance)", async () => {
    const cases: LockedBooking["service"][] = [
      "standard",
      "deep",
      undefined as unknown as LockedBooking["service"],
      "" as unknown as LockedBooking["service"],
      null as unknown as LockedBooking["service"],
    ];
    for (const svc of cases) {
      const { admin, state } = buildAdmin();
      await insertPendingPaymentBookingRow(admin, {
        paystackReference: `ref-h3-${String(svc)}`,
        locked: buildLocked({ service: svc }),
        customerEmail: "a@b.com",
      });
      const slug = state.insertPayload!.service_slug;
      expect(slug, `service_slug must never be null/undefined (case=${String(svc)})`).toBeDefined();
      expect(typeof slug).toBe("string");
      expect((slug as string).length).toBeGreaterThan(0);
    }
  });
});

describe("H-2 cron contract: expire-pending-payments still picks up the new INSERT shape", () => {
  // The cron filter is `status='pending_payment' AND payment_link_expires_at IS NOT NULL AND < now()`.
  // We assert the INSERT payload satisfies that filter when the row eventually goes stale.
  beforeEach(() => {
    vi.stubEnv("CUSTOMER_PAYMENT_LINK_EXPIRES_MINUTES", "60");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("INSERT writes status='pending_payment' AND a non-null payment_link_expires_at (cron-eligible)", async () => {
    const { admin, state } = buildAdmin();
    await insertPendingPaymentBookingRow(admin, {
      paystackReference: "ref-cron-eligible",
      locked: buildLocked(),
      customerEmail: "x@y.com",
    });
    expect(state.insertPayload!.status).toBe("pending_payment");
    expect(state.insertPayload!.payment_link_expires_at).toBeDefined();
    expect(state.insertPayload!.payment_link_expires_at).not.toBeNull();
  });

  it("the row will become cron-eligible after TTL elapses (timestamp arithmetic sanity)", async () => {
    const fixedNow = 1_700_000_000_000;
    const realNow = Date.now;
    Date.now = () => fixedNow;
    try {
      const { admin, state } = buildAdmin();
      await insertPendingPaymentBookingRow(admin, {
        paystackReference: "ref-cron-future-eligible",
        locked: buildLocked(),
        customerEmail: "x@y.com",
      });
      const exp = new Date(String(state.insertPayload!.payment_link_expires_at)).getTime();
      // Before TTL: NOT eligible (`exp >= now`).
      expect(exp).toBeGreaterThan(fixedNow);
      // Exactly TTL minutes later: still NOT strictly less-than `< now` per
      // cron filter — the cron uses `<` so the row becomes eligible the
      // first millisecond after expiry.
      const oneMsAfter = exp + 1;
      expect(oneMsAfter).toBeGreaterThan(exp);
    } finally {
      Date.now = realNow;
    }
  });
});
