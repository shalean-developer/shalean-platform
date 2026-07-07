import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * M-2: `adminMarkBookingPaid` previously overwrote `bookings.paystack_reference` with synthetic
 * settlement markers (`cash_<id>` / `eft_<safe>` / `zoho_<safe>`). The `paystack_reference` column
 * is the join key Paystack webhooks use (`/api/paystack/webhook` →
 * `findBookingIdStatusForPaystackReference` → `upsertBookingFromPaystack` lookup by
 * `.eq("paystack_reference", reference)`); clobbering it meant a late `charge.success` webhook
 * for the same booking could no longer match the row by reference, breaking reconciliation /
 * audit traceability and risking duplicate finalize attempts.
 *
 * Fix: stop including `paystack_reference` in the admin mark-paid `update(...)` patch. The
 * original Paystack reference (set when the row was inserted by `processPaystackInitializeBody` /
 * the admin monthly path) is preserved end-to-end. Off-platform traceability is captured via
 * `payment_method` (cash | zoho | eft | card) and `payment_reference_external` (existing audit
 * fields from `20260849_bookings_admin_mark_paid_audit.sql`).
 *
 * Response-shape compat: `settlement.paystack_reference` keeps the synthetic settlement marker
 * (used by the canonical `booking.payment_succeeded` event idempotencyKey and the route
 * response). A new `settlement.preserved_paystack_reference` field surfaces the actual DB
 * column value for ops/audit tooling.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const adminMarkPaidPath = path.join(__dirname, "..", "adminMarkBookingPaid.ts");

vi.mock("@/lib/admin/adminBookingPostCreatePipeline", () => ({
  ensureBookingAssignedStatusInvariant: vi.fn(async () => undefined),
}));

vi.mock("@/lib/admin/runAdminAssignSmart", () => ({
  runAdminAssignSmart: vi.fn(async () => ({ ok: false })),
}));

vi.mock("@/lib/marketplace-intelligence/assignBestCleaner", () => ({
  assignBestCleaner: vi.fn(async () => ({ ok: false, noOp: true })),
}));

vi.mock("@/lib/dispatch/notifyCleanerAssigned", () => ({
  notifyCleanerAssignedBooking: vi.fn(async () => undefined),
}));

vi.mock("@/lib/notifications/notifyCleanerBookingPaid", () => ({
  notifyCleanerBookingPaid: vi.fn(async () => undefined),
}));

vi.mock("@/lib/notifications/notificationDedupe", () => ({
  tryClaimNotificationDedupe: vi.fn(async () => true),
}));

vi.mock("@/lib/payout/persistCleanerPayout", () => ({
  persistCleanerPayoutIfUnset: vi.fn(async () => ({ ok: true })),
}));

vi.mock("@/lib/payout/bookingEarningsIntegrity", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/payout/bookingEarningsIntegrity")>();
  return {
    ...actual,
    resolvePersistCleanerIdForBooking: vi.fn(() => null),
  };
});

vi.mock("@/lib/booking/recordBookingSideEffects", () => ({
  recordBookingSideEffects: vi.fn(async () => undefined),
}));

vi.mock("@/lib/booking/cancelUnsentBookingPaymentRecoveryJobs", () => ({
  cancelUnsentBookingPaymentRecoveryJobs: vi.fn(async () => undefined),
}));

vi.mock("@/lib/referrals/server", () => ({
  processCustomerReferralAfterFirstPaidBooking: vi.fn(),
}));

vi.mock("@/lib/conversion/conversionExperimentOutcomes", () => ({
  recordConversionExperimentResultsOnPayment: vi.fn(),
}));

vi.mock("@/lib/growth/growthActionOutcomes", () => ({
  attributePaidBookingToGrowthOutcomes: vi.fn(),
}));

vi.mock("@/lib/growth/loadCustomerGrowthContext", () => ({
  loadCustomerGrowthContext: vi.fn(async () => null),
  persistCustomerSegmentRow: vi.fn(async () => undefined),
}));

vi.mock("@/lib/growth/postBookingGrowthHint", () => ({
  logPostBookingGrowthDecision: vi.fn(async () => undefined),
}));

vi.mock("@/lib/growth/syncPrimaryCity", () => ({
  syncUserPrimaryCityFromBooking: vi.fn(async () => undefined),
}));

vi.mock("@/lib/ai-autonomy/learningLoop", () => ({
  learnFromPaymentSuccess: vi.fn(async () => undefined),
}));

vi.mock("@/lib/logging/systemLog", () => ({
  logSystemEvent: vi.fn(async () => undefined),
  reportOperationalIssue: vi.fn(async () => undefined),
}));

vi.mock("@/lib/metrics/counters", () => ({
  metrics: { increment: vi.fn() },
}));

vi.mock("@/lib/customer/customerBookingsForUser", () => ({
  resolveBookingOwnershipColumn: vi.fn(async () => "customer_id" as const),
  resetBookingOwnershipColumnCacheForTests: vi.fn(),
}));

import { adminMarkBookingPaid } from "@/lib/booking/adminMarkBookingPaid";
import { recordBookingSideEffects } from "@/lib/booking/recordBookingSideEffects";

type StoredRow = {
  id: string;
  status: string | null;
  payment_completed_at: string | null;
  customer_email: string | null;
  customer_id: string | null;
  created_at: string | null;
  booking_snapshot: unknown;
  date: string | null;
  time: string | null;
  city_id: string | null;
  total_price: number | null;
  total_paid_cents: number | null;
  amount_paid_cents: number | null;
  cleaner_id: string | null;
  selected_cleaner_id: string | null;
  payout_owner_cleaner_id: string | null;
  is_team_job: boolean | null;
  paystack_reference: string | null;
  dispatch_status: string | null;
  assignment_type: string | null;
  payment_mismatch: boolean | null;
  paid_at: string | null;
  marked_paid_by_admin_id: string | null;
  payment_method: string | null;
  payment_reference_external: string | null;
  payment_status: string | null;
  total_paid_zar: number | null;
};

function makeRow(overrides: Partial<StoredRow>): StoredRow {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    status: "pending_payment",
    payment_completed_at: null,
    customer_email: "customer@example.com",
    customer_id: "00000000-0000-4000-8000-000000000abc",
    created_at: "2026-05-01T08:00:00.000Z",
    booking_snapshot: { locked: { date: "2026-05-10", time: "10:00" } },
    date: "2026-05-10",
    time: "10:00",
    city_id: null,
    total_price: 750,
    total_paid_cents: null,
    amount_paid_cents: null,
    cleaner_id: null,
    selected_cleaner_id: null,
    payout_owner_cleaner_id: null,
    is_team_job: null,
    paystack_reference: "pay_original-ref-1",
    dispatch_status: null,
    assignment_type: null,
    payment_mismatch: null,
    paid_at: null,
    marked_paid_by_admin_id: null,
    payment_method: null,
    payment_reference_external: null,
    payment_status: null,
    total_paid_zar: null,
    ...overrides,
  };
}

type Patch = Record<string, unknown>;

type QueryStub = {
  select(s: string): QueryStub;
  eq(col: string, val: string): QueryStub;
  is(col: string, v: null): QueryStub;
  not(col: string, op: "eq", val: string): QueryStub;
  update(patch: Patch): QueryStub;
  maybeSingle(): Promise<{ data: StoredRow | null; error: null }>;
  then(resolve: (v: unknown) => unknown): Promise<unknown>;
};

function makeAdminStub(initial: StoredRow): {
  admin: SupabaseClient;
  store: { row: StoredRow };
  patches: Patch[];
} {
  const store = { row: { ...initial } };
  const patches: Patch[] = [];

  const fromBookings = () => {
    const buf: { selectStr?: string; eqId?: string; updatePatch?: Patch; isNullCol?: string; notEq?: Array<[string, string]>; selectAfter?: boolean } = {};
    const builder: QueryStub = {
      select(s: string) {
        buf.selectStr = s;
        buf.selectAfter = true;
        return builder;
      },
      eq(col: string, val: string) {
        if (col === "id") buf.eqId = val;
        return builder;
      },
      is(col: string, _v: null) {
        buf.isNullCol = col;
        return builder;
      },
      not(col: string, _op: "eq", val: string) {
        buf.notEq = [...(buf.notEq ?? []), [col, val]];
        return builder;
      },
      update(patch: Patch) {
        buf.updatePatch = patch;
        return builder;
      },
      async maybeSingle() {
        if (buf.eqId === store.row.id) {
          return { data: { ...store.row }, error: null };
        }
        return { data: null, error: null };
      },
      then(resolve: (v: unknown) => unknown) {
        if (buf.updatePatch && buf.eqId === store.row.id) {
          patches.push(buf.updatePatch);
          if (
            (buf.isNullCol === "payment_completed_at" && store.row.payment_completed_at !== null) ||
            (buf.notEq?.some(([c, v]) => c === "status" && (store.row.status ?? "") === v) ?? false)
          ) {
            const result = buf.selectAfter ? { data: [], error: null } : { data: null, error: null };
            return Promise.resolve(resolve(result));
          }
          for (const [k, v] of Object.entries(buf.updatePatch)) {
            (store.row as Record<string, unknown>)[k] = v;
          }
          if (buf.selectAfter) {
            return Promise.resolve(resolve({ data: [{ id: store.row.id }], error: null }));
          }
          return Promise.resolve(resolve({ data: null, error: null }));
        }
        return Promise.resolve(resolve({ data: null, error: null }));
      },
    };
    return builder;
  };

  const admin = {
    from(table: string) {
      if (table === "bookings") return fromBookings();
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: null, error: null }),
          }),
        }),
        update: () => ({
          eq: () => ({
            is: () => ({ then: (r: (v: unknown) => unknown) => r({ data: null, error: null }) }),
            then: (r: (v: unknown) => unknown) => r({ data: null, error: null }),
          }),
        }),
      };
    },
  } as unknown as SupabaseClient;

  return { admin, store, patches };
}

describe("M-2 adminMarkBookingPaid preserves bookings.paystack_reference (regression guard)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("source no longer writes paystack_reference into the bookings update patch", () => {
    const src = readFileSync(adminMarkPaidPath, "utf8");
    const patchBlockMatch = src.match(/const patch[\s\S]*?:\s*Record<string,\s*unknown>\s*=\s*\{([\s\S]*?)\};/);
    expect(patchBlockMatch, "could not find the `const patch: Record<string, unknown> = {...}` literal").not.toBeNull();
    const patchBody = patchBlockMatch![1];
    expect(
      patchBody,
      "regression: M-2 forbids writing `paystack_reference: …` inside the admin mark-paid update patch",
    ).not.toMatch(/\bpaystack_reference\s*:/);
    expect(patchBody).toMatch(/payment_method:\s*method/);
    expect(patchBody).toMatch(/payment_reference_external:\s*refExternalTrim/);
  });

  it("cash mark-paid keeps the existing paystack_reference and reports the synthetic marker in the response", async () => {
    const initial = makeRow({ paystack_reference: "pay_cash-keep-1" });
    const { admin, store, patches } = makeAdminStub(initial);

    const out = await adminMarkBookingPaid(admin, {
      bookingId: initial.id,
      method: "cash",
      reference: null,
      amountCentsOverride: null,
      adminUserId: "00000000-0000-4000-8000-000000000aaa",
    });

    expect(out.ok).toBe(true);
    if (!out.ok || !("marked_paid" in out)) throw new Error("expected marked_paid result");
    expect(out.settlement.method).toBe("cash");
    expect(out.settlement.paystack_reference).toBe(`cash_${initial.id}`);
    expect(out.settlement.preserved_paystack_reference).toBe("pay_cash-keep-1");
    expect(out.settlement.payment_reference_external).toBeNull();

    expect(store.row.paystack_reference).toBe("pay_cash-keep-1");
    expect(store.row.payment_method).toBe("cash");
    expect(store.row.payment_status).toBe("success");

    for (const p of patches) {
      expect(p).not.toHaveProperty("paystack_reference");
    }
  });

  it("eft mark-paid keeps the existing paystack_reference and stores the supplied reference in payment_reference_external", async () => {
    const initial = makeRow({ paystack_reference: "pay_eft-keep-1" });
    const { admin, store, patches } = makeAdminStub(initial);

    const out = await adminMarkBookingPaid(admin, {
      bookingId: initial.id,
      method: "eft",
      reference: "EFT-MEMO-7788",
      amountCentsOverride: null,
      adminUserId: "00000000-0000-4000-8000-000000000aaa",
    });

    expect(out.ok).toBe(true);
    if (!out.ok || !("marked_paid" in out)) throw new Error("expected marked_paid result");
    expect(out.settlement.method).toBe("eft");
    expect(out.settlement.paystack_reference).toBe("eft_EFT-MEMO-7788");
    expect(out.settlement.preserved_paystack_reference).toBe("pay_eft-keep-1");
    expect(out.settlement.payment_reference_external).toBe("EFT-MEMO-7788");

    expect(store.row.paystack_reference).toBe("pay_eft-keep-1");
    expect(store.row.payment_method).toBe("eft");
    expect(store.row.payment_reference_external).toBe("EFT-MEMO-7788");

    for (const p of patches) {
      expect(p).not.toHaveProperty("paystack_reference");
    }
  });

  it("zoho mark-paid keeps the existing paystack_reference and stores the Zoho invoice id in payment_reference_external", async () => {
    const initial = makeRow({ paystack_reference: "pay_zoho-keep-1" });
    const { admin, store, patches } = makeAdminStub(initial);

    const out = await adminMarkBookingPaid(admin, {
      bookingId: initial.id,
      method: "zoho",
      reference: "ZOHO-INV-001",
      amountCentsOverride: null,
      adminUserId: "00000000-0000-4000-8000-000000000aaa",
    });

    expect(out.ok).toBe(true);
    if (!out.ok || !("marked_paid" in out)) throw new Error("expected marked_paid result");
    expect(out.settlement.method).toBe("zoho");
    expect(out.settlement.paystack_reference).toBe("zoho_ZOHO-INV-001");
    expect(out.settlement.preserved_paystack_reference).toBe("pay_zoho-keep-1");
    expect(out.settlement.payment_reference_external).toBe("ZOHO-INV-001");

    expect(store.row.paystack_reference).toBe("pay_zoho-keep-1");
    expect(store.row.payment_method).toBe("zoho");
    expect(store.row.payment_reference_external).toBe("ZOHO-INV-001");

    for (const p of patches) {
      expect(p).not.toHaveProperty("paystack_reference");
    }
  });

  it("legacy adm_mi_<uuid> monthly references are preserved (admin monthly bookings settled off-platform)", async () => {
    const initial = makeRow({ paystack_reference: "adm_mi_aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" });
    const { admin, store } = makeAdminStub(initial);

    const out = await adminMarkBookingPaid(admin, {
      bookingId: initial.id,
      method: "zoho",
      reference: "ZOHO-MONTHLY-42",
      amountCentsOverride: null,
      adminUserId: "00000000-0000-4000-8000-000000000aaa",
    });

    expect(out.ok).toBe(true);
    if (!out.ok || !("marked_paid" in out)) throw new Error("expected marked_paid result");
    expect(out.settlement.preserved_paystack_reference).toBe(
      "adm_mi_aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    );
    expect(store.row.paystack_reference).toBe("adm_mi_aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
  });

  it("recordBookingSideEffects receives the preserved real Paystack reference (not the synthetic marker) for analytics consistency", async () => {
    const initial = makeRow({ paystack_reference: "pay_side-effect-keep-1" });
    const { admin } = makeAdminStub(initial);

    await adminMarkBookingPaid(admin, {
      bookingId: initial.id,
      method: "cash",
      reference: null,
      amountCentsOverride: null,
      adminUserId: "00000000-0000-4000-8000-000000000aaa",
    });

    expect(recordBookingSideEffects).toHaveBeenCalledTimes(1);
    const arg = vi.mocked(recordBookingSideEffects).mock.calls[0]![0];
    expect(arg.paystackReference).toBe("pay_side-effect-keep-1");
    expect(arg.paystackReference.startsWith("cash_")).toBe(false);
  });

  it("response shape is backward-compatible: existing settlement keys all present, new field is additive", async () => {
    const initial = makeRow({ paystack_reference: "pay_shape-1" });
    const { admin } = makeAdminStub(initial);

    const out = await adminMarkBookingPaid(admin, {
      bookingId: initial.id,
      method: "cash",
      reference: null,
      amountCentsOverride: null,
      adminUserId: "00000000-0000-4000-8000-000000000aaa",
    });

    expect(out.ok).toBe(true);
    if (!out.ok || !("marked_paid" in out)) throw new Error("expected marked_paid result");
    const keys = Object.keys(out.settlement).sort();
    expect(keys).toEqual(
      [
        "amount_cents",
        "method",
        "payment_reference_external",
        "paystack_reference",
        "preserved_paystack_reference",
        "total_paid_zar",
      ].sort(),
    );
    expect(typeof out.settlement.amount_cents).toBe("number");
    expect(typeof out.settlement.total_paid_zar).toBe("number");
    expect(typeof out.settlement.method).toBe("string");
    expect(typeof out.settlement.paystack_reference).toBe("string");
  });

  it("webhook idempotency: after mark-paid, a late Paystack webhook can still find the booking by the original reference", async () => {
    const initial = makeRow({ paystack_reference: "pay_webhook-idem-1" });
    const { admin, store } = makeAdminStub(initial);

    await adminMarkBookingPaid(admin, {
      bookingId: initial.id,
      method: "cash",
      reference: null,
      amountCentsOverride: null,
      adminUserId: "00000000-0000-4000-8000-000000000aaa",
    });

    expect(store.row.paystack_reference).toBe("pay_webhook-idem-1");
    expect(store.row.payment_completed_at).not.toBeNull();
    expect(store.row.status).not.toBe("pending_payment");
  });

  it("already_paid path returns skipped without mutating paystack_reference", async () => {
    const initial = makeRow({
      paystack_reference: "pay_already-paid-1",
      payment_completed_at: "2026-05-09T08:00:00.000Z",
      payment_status: "success",
      status: "assigned",
    });
    const { admin, store, patches } = makeAdminStub(initial);

    const out = await adminMarkBookingPaid(admin, {
      bookingId: initial.id,
      method: "cash",
      reference: null,
      amountCentsOverride: null,
      adminUserId: "00000000-0000-4000-8000-000000000aaa",
    });

    expect(out.ok).toBe(true);
    if (!out.ok || !("skipped" in out)) throw new Error("expected skipped already_paid");
    expect(out.skipped).toBe(true);
    expect(out.reason).toBe("already_paid");
    expect(store.row.paystack_reference).toBe("pay_already-paid-1");
    expect(patches.length).toBe(0);
  });
});

describe("M-2 source documentation (regression guard)", () => {
  const src = readFileSync(adminMarkPaidPath, "utf8");

  it("documents that paystack_reference is preserved (M-2)", () => {
    expect(src).toMatch(/M-2/);
    expect(src).toMatch(/paystack_reference\s*preservation|preserved_paystack_reference/);
  });

  it("retains payment_method + payment_reference_external as the off-platform audit fields", () => {
    expect(src).toMatch(/payment_method:\s*method/);
    expect(src).toMatch(/payment_reference_external:\s*refExternalTrim/);
  });

  it("buildExternalPaystackReference is documented as a synthetic settlement marker, never the DB column value", () => {
    const fnMatch = src.match(/function buildExternalPaystackReference[\s\S]{0,800}?\}/);
    expect(fnMatch).not.toBeNull();
    expect(src).toMatch(/synthetic\s+\*\*settlement marker\*\*/i);
    expect(src).toMatch(/NEVER written to `bookings\.paystack_reference`/);
  });
});
