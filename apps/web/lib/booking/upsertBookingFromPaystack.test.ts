import { describe, expect, it, vi, beforeEach } from "vitest";

const successEffect = vi.hoisted(() => vi.fn());
vi.mock("@/lib/recurring/refreshRecurringPaymentStateForBooking", () => ({ refreshRecurringPaymentStateForBooking: successEffect }));
vi.mock("@/lib/booking/promoteV2TeamBookingAfterPayment", () => ({ promoteV2TeamBookingAfterPayment: successEffect }));
vi.mock("@/lib/booking/persistPreferredCleaners", () => ({ syncPreferredCleanerRosterFromBookingRow: successEffect }));
vi.mock("@/lib/referrals/server", () => ({ createPendingCustomerReferral: successEffect, processCustomerReferralAfterFirstPaidBooking: successEffect }));
vi.mock("@/lib/dispatch/preferredCleanerDispatch", () => ({ startPreferredCleanerDispatchAfterPayment: successEffect }));
vi.mock("@/lib/admin/runAdminAssignSmart", () => ({ runAdminAssignSmart: successEffect }));
vi.mock("@/lib/marketplace-intelligence/assignBestCleaner", () => ({ assignBestCleaner: successEffect }));
vi.mock("@/lib/dispatch/notifyCleanerAssigned", () => ({ notifyCleanerAssignedBooking: successEffect }));
vi.mock("@/lib/booking/recordBookingSideEffects", () => ({ recordBookingSideEffects: successEffect }));
vi.mock("@/lib/booking/cancelUnsentBookingPaymentRecoveryJobs", () => ({ cancelUnsentBookingPaymentRecoveryJobs: successEffect }));
vi.mock("@/lib/growth/syncPrimaryCity", () => ({ syncUserPrimaryCityFromBooking: successEffect }));
vi.mock("@/lib/growth/growthActionOutcomes", () => ({ attributePaidBookingToGrowthOutcomes: successEffect }));
vi.mock("@/lib/conversion/conversionExperimentOutcomes", () => ({ recordConversionExperimentResultsOnPayment: successEffect }));
vi.mock("@/lib/ai-autonomy/learningLoop", () => ({ learnFromPaymentSuccess: successEffect }));
vi.mock("@/lib/payout/persistCleanerPayout", () => ({ persistCleanerPayoutIfUnset: successEffect }));
vi.mock("@/lib/booking/resolveBookingUserId", () => ({ resolveBookingUserId: vi.fn().mockResolvedValue(null) }));
vi.mock("@/lib/booking/checkoutCleanerEligibility", () => ({
  resolveCheckoutCleanerSelection: vi.fn().mockResolvedValue({ kind: "no_pick" }),
  checkoutPaidDispatchOfferCleanerId: vi.fn().mockReturnValue(null),
}));
vi.mock("@/lib/booking/resolveLocationId", () => ({
  resolveBookingLocationContext: vi.fn().mockResolvedValue({ locationId: null, cityId: null }),
}));
vi.mock("@/lib/pricing/demandSupplySurge", () => ({
  getDemandSupplySnapshotByCity: vi.fn().mockResolvedValue({ multiplier: 1 }), getSurgeLabel: vi.fn(),
}));
vi.mock("@/lib/payout/tenureBasedCleanerLineShare", () => ({
  resolveTenureBasedCleanerShareForBookingRow: vi.fn().mockResolvedValue(null),
}));
vi.mock("@/lib/pay/paymentLinkDeliveryEvents", () => ({
  resolvePaymentAttributionTouches: vi.fn().mockResolvedValue({ firstTouch: null, lastTouch: null, assistChannels: [] }),
}));
import { resolveBookingUserId } from "@/lib/booking/resolveBookingUserId";
import { enqueueFailedJob } from "@/lib/booking/failedJobs";

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: vi.fn(),
}));

vi.mock("@/lib/booking/failedJobs", () => ({
  enqueueFailedJob: vi.fn().mockResolvedValue(true),
}));

vi.mock("@/lib/logging/systemLog", () => ({
  logSystemEvent: vi.fn().mockResolvedValue(undefined),
  reportOperationalIssue: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/observability/recordSystemMetric", () => ({
  recordSystemMetric: vi.fn().mockResolvedValue(undefined),
}));

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { parseCheckoutPriceSnapshotV1FromMeta } from "@/lib/booking/priceSnapshotBooking";
import {
  detectMonthlyManagedRowForPaystackFinalize,
  upsertBookingFromPaystack,
} from "@/lib/booking/upsertBookingFromPaystack";

const getSupabaseAdminMock = vi.mocked(getSupabaseAdmin);

function bookingSelectOnce(data: unknown, error: { message: string } | null = null) {
  return {
    from: vi.fn(() => ({
      select: vi.fn((columns: string) => {
        if (columns === "customer_id") {
          return {
            limit: vi.fn(async () => ({ data: [], error: null })),
          };
        }
        return {
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({ data, error })),
          })),
        };
      }),
    })),
  };
}

describe("parseCheckoutPriceSnapshotV1FromMeta (Paystack string metadata)", () => {
  const minimalCheckoutSnap = {
    version: 1,
    currency: "ZAR",
    total_zar: 500,
    subtotal_zar: 400,
    extras_total_zar: 50,
    discount_zar: 0,
    tip_zar: 50,
    visit_total_zar: 450,
    duration_hours: 3,
    cleaners_count: 1,
    line_items: [{ id: "a", name: "Visit", amount_zar: 450 }],
    pricing_version_id: null as string | null,
  };

  it("accepts stringified price_snapshot", () => {
    const out = parseCheckoutPriceSnapshotV1FromMeta({
      price_snapshot: JSON.stringify(minimalCheckoutSnap),
    });
    expect(out).not.toBeNull();
    expect(out?.total_zar).toBe(500);
  });

  it("accepts double-encoded JSON string", () => {
    const once = JSON.stringify(minimalCheckoutSnap);
    const out = parseCheckoutPriceSnapshotV1FromMeta({
      price_snapshot: JSON.stringify(once),
    });
    expect(out).not.toBeNull();
    expect(out?.total_zar).toBe(500);
  });

  it("accepts version/currency as loose strings", () => {
    const loose = { ...minimalCheckoutSnap, version: "1" as unknown as number, currency: "zar" };
    const out = parseCheckoutPriceSnapshotV1FromMeta({
      price_snapshot: JSON.stringify(loose),
    });
    expect(out).not.toBeNull();
    expect(out?.total_zar).toBe(500);
  });
});

describe("upsertBookingFromPaystack", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws if price snapshot missing", async () => {
    getSupabaseAdminMock.mockReturnValue(
      bookingSelectOnce(null) as unknown as ReturnType<typeof getSupabaseAdmin>,
    );
    await expect(
      upsertBookingFromPaystack({
        paystackReference: "ref-missing-snap",
        amountCents: 10_000,
        currency: "ZAR",
        customerEmail: "a@b.co",
        snapshot: { locked: { locked: true, lockedAt: new Date().toISOString() } } as never,
        paystackMetadata: {},
      }),
    ).rejects.toThrow(/Missing price snapshot/i);
  });

  it("returns skipped if booking already finalized (non pending_payment)", async () => {
    getSupabaseAdminMock.mockReturnValue(
      bookingSelectOnce({
        id: "00000000-0000-4000-8000-000000000001",
        status: "pending",
        paystack_reference: "ref-already-paid", customer_email: null, customer_id: null,
        is_recurring_generated: false,
        price_snapshot: null,
      }) as unknown as ReturnType<typeof getSupabaseAdmin>,
    );
    const result = await upsertBookingFromPaystack({
      paystackReference: "ref-already-paid",
      amountCents: 10_000,
      currency: "ZAR",
      customerEmail: "a@b.co",
      snapshot: null,
      paystackMetadata: {},
    });
    expect(result.skipped).toBe(true);
    expect(result.ok).toBe(true);
    expect(result.bookingId).toBe("00000000-0000-4000-8000-000000000001");
  });
});

/**
 * Fixes the prepaid-payout regression: `bookingPayableForWeeklyBatch` requires
 * `payment_status='success'` for non-monthly Paystack rows. Monthly-managed rows must
 * keep their own lifecycle (`pending_monthly` → `success` via `applyMonthlyInvoicePayment`).
 */
describe("detectMonthlyManagedRowForPaystackFinalize (Paystack finalize payment_status guard)", () => {
  function fakeAdmin(billingType: string | null) {
    return {
      from: (table: string) => {
        if (table !== "user_profiles") throw new Error(`unexpected table ${table}`);
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: billingType == null ? null : { billing_type: billingType },
                error: null,
              }),
            }),
          }),
        };
      },
    } as unknown as ReturnType<typeof getSupabaseAdmin>;
  }

  it("non-monthly per-booking row: returns false (Paystack finalize will write payment_status='success')", async () => {
    const result = await detectMonthlyManagedRowForPaystackFinalize(
      fakeAdmin("per_booking"),
      {
        id: "b1",
        status: "pending_payment",
        billing_type: "per_booking",
        is_monthly_billing_booking: false,
        monthly_invoice_id: null,
        payment_status: null,
      },
      "user-1",
    );
    expect(result).toBe(false);
  });

  it("existing row flagged is_monthly_billing_booking=true: returns true (no overwrite)", async () => {
    const result = await detectMonthlyManagedRowForPaystackFinalize(
      fakeAdmin("monthly"),
      {
        id: "b2",
        status: "pending_payment",
        is_monthly_billing_booking: true,
        billing_type: null,
        monthly_invoice_id: null,
        payment_status: null,
      },
      "user-2",
    );
    expect(result).toBe(true);
  });

  it("existing row with billing_type='recurring_invoice': returns true", async () => {
    const result = await detectMonthlyManagedRowForPaystackFinalize(
      fakeAdmin(null),
      {
        id: "b3",
        billing_type: "recurring_invoice",
        is_monthly_billing_booking: null,
        monthly_invoice_id: null,
        payment_status: null,
      },
      null,
    );
    expect(result).toBe(true);
  });

  it("existing row with monthly_invoice_id linked: returns true", async () => {
    const result = await detectMonthlyManagedRowForPaystackFinalize(
      fakeAdmin(null),
      {
        id: "b4",
        billing_type: null,
        is_monthly_billing_booking: null,
        monthly_invoice_id: "00000000-0000-4000-8000-00000000aaaa",
        payment_status: null,
      },
      null,
    );
    expect(result).toBe(true);
  });

  it("existing row with payment_status='pending_monthly': returns true (do not overwrite monthly state)", async () => {
    const result = await detectMonthlyManagedRowForPaystackFinalize(
      fakeAdmin(null),
      {
        id: "b5",
        billing_type: null,
        is_monthly_billing_booking: null,
        monthly_invoice_id: null,
        payment_status: "pending_monthly",
      },
      null,
    );
    expect(result).toBe(true);
  });

  it("prepaid bv2_ checkout ref overrides monthly flags so payment_status can be success", async () => {
    const result = await detectMonthlyManagedRowForPaystackFinalize(
      fakeAdmin("monthly"),
      {
        id: "b6",
        status: "pending_payment",
        is_monthly_billing_booking: true,
        billing_type: "recurring_invoice",
        monthly_invoice_id: "00000000-0000-4000-8000-00000000bbbb",
        payment_status: "pending_monthly",
      },
      "user-2",
      "bv2_1783869227426_wue9tg",
    );
    expect(result).toBe(false);
  });

  it("no existing row but resolved customer is monthly: returns true (defensive guard for new-insert path)", async () => {
    const result = await detectMonthlyManagedRowForPaystackFinalize(
      fakeAdmin("monthly"),
      null,
      "user-monthly",
    );
    expect(result).toBe(true);
  });

  it("no existing row and resolved customer is per_booking: returns false", async () => {
    const result = await detectMonthlyManagedRowForPaystackFinalize(
      fakeAdmin("per_booking"),
      null,
      "user-pb",
    );
    expect(result).toBe(false);
  });
});

describe("observed pending upsert conflict propagation", () => {
  const bookingId = "00000000-0000-4000-8000-000000000001";
  const snapshot = {
    version: 1, currency: "ZAR", total_zar: 125.5, subtotal_zar: 125.5,
    extras_total_zar: 0, discount_zar: 0, tip_zar: 0, visit_total_zar: 125.5,
    duration_hours: 3, cleaners_count: 1,
    line_items: [{ id: "visit", name: "Visit", amount_zar: 125.5 }], pricing_version_id: null,
  };
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(resolveBookingUserId).mockResolvedValue(null);
  });

  function pendingDb(mode: "id" | "paystack_reference", competing: Record<string, unknown> = {}) {
    const initial: Record<string, unknown> = {
      id: bookingId, status: "pending_payment", customer_email: " Payer@Example.com ",
      customer_id: "owner-a", paystack_reference: mode === "id" ? bookingId : "pay_verified",
      is_recurring_generated: false, price_snapshot: null,
    };
    const current = { ...initial };
    const writes = vi.fn();
    const reads: string[] = [];
    const predicates: Array<[string, unknown]> = [];
    const from = vi.fn((table: string) => {
      if (table !== "bookings") throw new Error("Unexpected side-effect table " + table);
      let columns = "";
      let patch: Record<string, unknown> | null = null;
      const filters: Array<[string, unknown]> = [];
      const query = {
        select: vi.fn((value: string) => { columns = value; return query; }),
        limit: vi.fn(async () => ({ data: [], error: null })),
        eq: vi.fn((key: string, value: unknown) => { filters.push([key, value]); return query; }),
        is: vi.fn((key: string, value: unknown) => { filters.push([key, value]); return query; }),
        update: vi.fn((value: Record<string, unknown>) => {
          Object.assign(current, competing); // competing commit after initial read, before UPDATE
          patch = value; writes(value); return query;
        }),
        maybeSingle: vi.fn(async () => {
          if (patch) {
            predicates.push(...filters);
            if (!filters.every(([key, value]) => current[key] === value)) return { data: null, error: null };
            Object.assign(current, patch);
            return { data: { id: bookingId }, error: null };
          }
          reads.push(columns);
          if (columns === "payment_link_first_sent_at") return { data: null, error: null };
          if (mode === "id" && filters.some(([key]) => key === "paystack_reference")) return { data: null, error: null };
          return { data: { ...initial }, error: null };
        }),
      };
      return query;
    });
    getSupabaseAdminMock.mockReturnValue({ from } as unknown as ReturnType<typeof getSupabaseAdmin>);
    return { initial, current, writes, predicates, reads };
  }

  function input(overrides = {}) {
    return {
      paystackReference: "pay_verified", amountCents: 12550, currency: "ZAR",
      customerEmail: "payer@example.com", snapshot: null,
      paystackMetadata: { booking_id: bookingId, price_snapshot: JSON.stringify(snapshot) }, ...overrides,
    };
  }

  for (const mode of ["id", "paystack_reference"] as const) {
    it.each([
      { customer_email: "other@example.com" }, { customer_id: "owner-b" },
      { paystack_reference: "pay_competing" }, { status: "pending" },
    ])(mode + " surfaces competing mutation %j without success or replay", async (competing) => {
      const db = pendingDb(mode, competing);
      const result = await upsertBookingFromPaystack(input());
      expect(result).toMatchObject({ ok: false, code: "PAYMENT_FINALIZATION_CONFLICT", bookingId });
      expect(successEffect).not.toHaveBeenCalled();
      expect(enqueueFailedJob).not.toHaveBeenCalled();
      expect(db.writes).toHaveBeenCalledTimes(1);
      expect(db.predicates).toEqual([
        ["id", bookingId], ["status", "pending_payment"],
        ["customer_email", db.initial.customer_email], ["customer_id", "owner-a"],
        ["paystack_reference", db.initial.paystack_reference],
      ]);
      expect(db.reads).not.toContain("id, status");
    });
    it.each(["email", "owner"])(mode + " rejects established %s mismatch before any write", async (field) => {
      const db = pendingDb(mode);
      if (field === "owner") vi.mocked(resolveBookingUserId).mockResolvedValue("other-owner");
      const result = await upsertBookingFromPaystack(input(field === "email" ? { customerEmail: "other@example.com" } : {}));
      expect(result).toMatchObject({ ok: false, code: "PAYMENT_CUSTOMER_IDENTITY_MISMATCH", bookingId });
      expect(db.writes).not.toHaveBeenCalled();
      expect(successEffect).not.toHaveBeenCalled();
      expect(enqueueFailedJob).not.toHaveBeenCalled();
    });
    it.each([{ currency: "USD" }, { amountCents: 9940 }])(
      mode + " guards mismatch write %j and blocks stale recovery", async (override) => {
        const db = pendingDb(mode, { customer_id: "competing-owner" });
        const result = await upsertBookingFromPaystack(input(override));
        expect(result).toMatchObject({ ok: false, code: "PAYMENT_FINALIZATION_CONFLICT", bookingId });
        expect(db.writes).toHaveBeenCalledTimes(1);
        expect(enqueueFailedJob).not.toHaveBeenCalled();
        expect(successEffect).not.toHaveBeenCalled();
        expect(db.current.status).toBe("pending_payment");
      },
    );
  }
});

describe("Slice 2B already-finalized upsert replay", () => {
  const id = "00000000-0000-4000-8000-000000000001";
  const stored = { id, status: "pending", paystack_reference: "pay_current", customer_email: "current@example.com", customer_id: "owner-a" };
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(resolveBookingUserId).mockResolvedValue("owner-a");
    getSupabaseAdminMock.mockReturnValue({
      from: () => {
        const filters: Array<[string, unknown]> = [];
        const q = {
          select: () => q, limit: async () => ({ data: [], error: null }),
          eq: (key: string, value: unknown) => { filters.push([key, value]); return q; },
          maybeSingle: async () => ({ data: filters.every(([key, value]) => stored[key as keyof typeof stored] === value) ? { ...stored } : null, error: null }),
        };
        return q;
      },
    } as unknown as ReturnType<typeof getSupabaseAdmin>);
  });
  const input = { paystackReference: "pay_current", amountCents: 12550, currency: "ZAR", customerEmail: " CURRENT@example.com ", snapshot: null, paystackMetadata: { booking_id: id } };
  it.each([
    { paystackReference: "pay_old" }, { customerEmail: "old@example.com" }, { customerEmail: "" },
    { paystackMetadata: { booking_id: "00000000-0000-4000-8000-000000000009" } },
  ])("rejects non-equivalent context %j without writes/effects", async (change) => {
    expect(await upsertBookingFromPaystack({ ...input, ...change })).toMatchObject({ ok: false, code: "PAYMENT_FINALIZATION_REPLAY_MISMATCH", bookingId: id });
    expect(successEffect).not.toHaveBeenCalled();
    expect(enqueueFailedJob).not.toHaveBeenCalled();
  });
  it.each(["other-owner", null])("rejects conflicting/missing owner %s", async (owner) => {
    vi.mocked(resolveBookingUserId).mockResolvedValue(owner);
    expect(await upsertBookingFromPaystack(input)).toMatchObject({ ok: false, code: "PAYMENT_FINALIZATION_REPLAY_MISMATCH" });
    expect(successEffect).not.toHaveBeenCalled();
  });
  it("preserves equivalent replay", async () => {
    expect(await upsertBookingFromPaystack(input)).toMatchObject({ ok: true, skipped: true, bookingId: id });
    expect(successEffect).not.toHaveBeenCalled();
  });
});
