import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/logging/systemLog", () => ({
  reportOperationalIssue: vi.fn().mockResolvedValue(undefined),
  logSystemEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/recurring/recurringBookingInsertGuards", () => ({
  findActiveCustomerSlotOccupant: vi.fn().mockResolvedValue(null),
  recurringPlanOccurrenceRowExists: vi.fn().mockResolvedValue(false),
  recurringBookingCustomerOwnershipPatch: vi
    .fn()
    .mockResolvedValue({ customer_id: "55555555-5555-4555-8555-555555555555" }),
}));

vi.mock("@/lib/recurring/fetchLastAssignedCleanerForRecurringPlan", () => ({
  fetchLastAssignedCleanerForRecurringPlan: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/recurring/autoChargeRetryPolicy", () => ({
  recurringAutoChargeMaxRetries: () => 3,
}));

vi.mock("@/lib/recurring/deriveRecurringPaymentState", () => ({
  deriveRecurringPaymentState: vi.fn(() => "active_recurring"),
}));

vi.mock("@/lib/booking/provisionalPriceSnapshotFromLocked", () => ({
  provisionalPriceSnapshotJson: () => ({ v: 1 }),
}));

vi.mock("@/components/booking/serviceCategories", () => ({
  getServiceLabel: (s: unknown) => String(s ?? ""),
}));

vi.mock("@/lib/admin/adminBookingCreateFingerprint", () => ({
  adminBookingServiceSlug: (s: unknown) => String(s ?? "standard").toLowerCase(),
}));

import {
  recurringOccurrenceCleanerPatch,
  resolveRecurringPreferredCleanerId,
} from "@/lib/recurring/resolveRecurringPreferredCleanerId";
import { reportOperationalIssue } from "@/lib/logging/systemLog";
import { refreshRecurringPaymentStateForBooking } from "@/lib/recurring/refreshRecurringPaymentStateForBooking";
import { insertRecurringOccurrenceBooking } from "@/lib/recurring/insertRecurringOccurrenceBooking";
import { insertMonthlyRecurringOccurrenceBooking } from "@/lib/recurring/insertMonthlyRecurringOccurrenceBooking";
import type { BookingSnapshotV1 } from "@/lib/booking/paystackChargeTypes";

type AnyMock = ReturnType<typeof vi.fn>;
const reportOpMock = reportOperationalIssue as unknown as AnyMock;

function findRepoRoot(): string {
  let dir = resolve(__dirname);
  for (let i = 0; i < 10; i += 1) {
    if (existsSync(join(dir, "supabase", "migrations"))) return dir;
    const parent = resolve(dir, "..");
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error("Could not locate repo root");
}

const REPO_ROOT = findRepoRoot();
const readSrc = (...segs: string[]) => readFileSync(join(REPO_ROOT, ...segs), "utf8");

const VALID_CLEANER_A = "11111111-1111-4111-8111-111111111111";
const VALID_CLEANER_B = "22222222-2222-4222-8222-222222222222";
const VALID_CLEANER_C = "33333333-3333-4333-8333-333333333333";
const RECURRING_PLAN_ID = "44444444-4444-4444-8444-444444444444";
const CUSTOMER_ID = "55555555-5555-4555-8555-555555555555";
const BOOKING_ID = "66666666-6666-4666-8666-666666666666";

function buildLockedTemplate(opts?: { lockedCleanerId?: string | null; topCleanerId?: string | null }): unknown {
  const locked: Record<string, unknown> = {
    locked: true,
    lockedAt: "2026-04-01T08:00:00.000Z",
    date: "2026-05-12",
    time: "09:00",
    finalPrice: 600,
    finalHours: 3,
    rooms: 2,
    bathrooms: 1,
    extras: [],
    extraRooms: 0,
    surge: 1,
    service: "standard",
    location: "1 Sample Rd, Cape Town",
  };
  if (opts?.lockedCleanerId !== undefined) locked.cleaner_id = opts.lockedCleanerId;
  const tpl: Record<string, unknown> = {
    v: 1,
    locked,
    customer: { name: "Sam", email: "sam@example.com", phone: "+27000" },
    total_zar: 600,
  };
  if (opts?.topCleanerId !== undefined) tpl.cleaner_id = opts.topCleanerId;
  return tpl;
}

type CapturedInsert = { table: string; row: Record<string, unknown> };

function buildFakeBookingsAdmin(opts: { onInsertReturnsId?: string } = {}) {
  const captured: { inserts: CapturedInsert[] } = { inserts: [] };
  const insertedId = opts.onInsertReturnsId ?? BOOKING_ID;
  const admin = {
    from(table: string) {
      if (table === "bookings") {
        return {
          insert: (row: Record<string, unknown>) => {
            captured.inserts.push({ table, row });
            return {
              select: () => ({
                maybeSingle: async () => ({ data: { id: insertedId }, error: null }),
              }),
            };
          },
        };
      }
      throw new Error(`Unexpected table read: ${table}`);
    },
  };
  return { admin: admin as unknown as Parameters<typeof insertRecurringOccurrenceBooking>[0], captured };
}

/**
 * The `BookingSnapshotV1.locked` field nominally requires the full `BookingStep1State`. The
 * resolver only reads `locked.cleaner_id`, so these tests build a minimal locked object and
 * cast through `unknown` to keep the focus on resolution logic without having to maintain a
 * sprawling step-1 fixture every time the step-1 type changes.
 */
function partialTpl(opts: { lockedCleanerId?: string; topCleanerId?: string }): BookingSnapshotV1 {
  const locked: Record<string, unknown> = {
    locked: true,
    lockedAt: "2026-04-01T00:00:00Z",
    date: "2026-05-12",
    time: "09:00",
    finalPrice: 1,
    finalHours: 1,
    rooms: 1,
    bathrooms: 1,
    extras: [],
    extraRooms: 0,
    surge: 1,
  };
  if (opts.lockedCleanerId !== undefined) locked.cleaner_id = opts.lockedCleanerId;
  const tpl: Record<string, unknown> = { v: 1, locked };
  if (opts.topCleanerId !== undefined) tpl.cleaner_id = opts.topCleanerId;
  return tpl as unknown as BookingSnapshotV1;
}

describe("M-6: resolveRecurringPreferredCleanerId (pure resolution)", () => {
  it("prefers last assigned occurrence cleaner over snapshot fallbacks", () => {
    expect(
      resolveRecurringPreferredCleanerId({
        recurringPreferredCleanerId: null,
        lastAssignedCleanerId: VALID_CLEANER_B,
        snapshotTemplate: partialTpl({
          lockedCleanerId: VALID_CLEANER_C,
          topCleanerId: VALID_CLEANER_A,
        }),
      }),
    ).toBe(VALID_CLEANER_B);
  });

  it("prefers the explicit recurring column when set", () => {
    expect(
      resolveRecurringPreferredCleanerId({
        recurringPreferredCleanerId: VALID_CLEANER_A,
        snapshotTemplate: partialTpl({
          lockedCleanerId: VALID_CLEANER_B,
          topCleanerId: VALID_CLEANER_C,
        }),
      }),
    ).toBe(VALID_CLEANER_A);
  });

  it("falls back to locked.cleaner_id when recurring column is null", () => {
    expect(
      resolveRecurringPreferredCleanerId({
        recurringPreferredCleanerId: null,
        snapshotTemplate: partialTpl({
          lockedCleanerId: VALID_CLEANER_B,
          topCleanerId: VALID_CLEANER_C,
        }),
      }),
    ).toBe(VALID_CLEANER_B);
  });

  it("falls back to top-level snapshot.cleaner_id when locked has no cleaner", () => {
    expect(
      resolveRecurringPreferredCleanerId({
        recurringPreferredCleanerId: null,
        snapshotTemplate: partialTpl({ topCleanerId: VALID_CLEANER_C }),
      }),
    ).toBe(VALID_CLEANER_C);
  });

  it("returns null when no source has a cleaner (legacy plans without a pick)", () => {
    expect(
      resolveRecurringPreferredCleanerId({
        recurringPreferredCleanerId: null,
        snapshotTemplate: null,
      }),
    ).toBe(null);
  });

  it("rejects malformed UUIDs at every level (never throws, never returns garbage)", () => {
    expect(
      resolveRecurringPreferredCleanerId({
        recurringPreferredCleanerId: "definitely-not-a-uuid",
        snapshotTemplate: partialTpl({
          lockedCleanerId: "not-a-uuid",
          topCleanerId: "also-not-a-uuid",
        }),
      }),
    ).toBe(null);
  });
});

describe("M-6: recurringOccurrenceCleanerPatch (booking row patch shape)", () => {
  it("returns selected_cleaner_id + user_selected + null cleaner_id for pending_payment", () => {
    expect(recurringOccurrenceCleanerPatch(VALID_CLEANER_A, { operationalStatus: "pending_payment" })).toEqual({
      selected_cleaner_id: VALID_CLEANER_A,
      assignment_type: "user_selected",
      cleaner_id: null,
    });
  });

  it("promotes monthly pending rows to assigned when reusing a cleaner", () => {
    const patch = recurringOccurrenceCleanerPatch(VALID_CLEANER_A, { operationalStatus: "pending" });
    expect(patch.selected_cleaner_id).toBe(VALID_CLEANER_A);
    expect(patch.cleaner_id).toBe(VALID_CLEANER_A);
    expect(patch.assignment_type).toBe("user_selected");
    expect(patch.status).toBe("assigned");
    expect(patch.dispatch_status).toBe("assigned");
    expect(patch.cleaner_response_status).toBe("pending");
    expect(typeof patch.assigned_at).toBe("string");
  });

  it("returns empty patch when no preferred cleaner (preserves dispatch-from-scratch behaviour)", () => {
    expect(recurringOccurrenceCleanerPatch(null)).toEqual({});
  });
});

describe("M-6: insertRecurringOccurrenceBooking propagates preferred cleaner", () => {
  it("writes selected_cleaner_id + assignment_type=user_selected + cleaner_id=null when recurring column has a cleaner", async () => {
    const { admin, captured } = buildFakeBookingsAdmin();
    const result = await insertRecurringOccurrenceBooking(admin, {
      recurring: {
        id: RECURRING_PLAN_ID,
        customer_id: CUSTOMER_ID,
        price: 600,
        booking_snapshot_template: buildLockedTemplate(),
        preferred_cleaner_id: VALID_CLEANER_A,
      },
      occurrenceDateYmd: "2026-05-19",
      customerEmail: "Sam@Example.com",
      customerName: "Sam",
      customerPhone: "+27000",
    });
    expect(result.ok).toBe(true);
    expect(captured.inserts).toHaveLength(1);
    const row = captured.inserts[0]!.row;
    expect(row.selected_cleaner_id).toBe(VALID_CLEANER_A);
    expect(row.assignment_type).toBe("user_selected");
    expect(row.cleaner_id).toBe(null);
    expect(row.recurring_id).toBe(RECURRING_PLAN_ID);
    expect(row.is_recurring_generated).toBe(true);
    expect(row.status).toBe("pending_payment");
  });

  it("falls back to snapshot.locked.cleaner_id when recurring column is null", async () => {
    const { admin, captured } = buildFakeBookingsAdmin();
    const result = await insertRecurringOccurrenceBooking(admin, {
      recurring: {
        id: RECURRING_PLAN_ID,
        customer_id: CUSTOMER_ID,
        price: 600,
        booking_snapshot_template: buildLockedTemplate({ lockedCleanerId: VALID_CLEANER_B }),
        preferred_cleaner_id: null,
      },
      occurrenceDateYmd: "2026-05-19",
      customerEmail: "sam@example.com",
      customerName: "Sam",
      customerPhone: "+27000",
    });
    expect(result.ok).toBe(true);
    const row = captured.inserts[0]!.row;
    expect(row.selected_cleaner_id).toBe(VALID_CLEANER_B);
    expect(row.assignment_type).toBe("user_selected");
    expect(row.cleaner_id).toBe(null);
  });

  it("does NOT include cleaner-patch keys when no preferred cleaner anywhere (preserves auto-dispatch behaviour)", async () => {
    const { admin, captured } = buildFakeBookingsAdmin();
    const result = await insertRecurringOccurrenceBooking(admin, {
      recurring: {
        id: RECURRING_PLAN_ID,
        customer_id: CUSTOMER_ID,
        price: 600,
        booking_snapshot_template: buildLockedTemplate(),
        preferred_cleaner_id: null,
      },
      occurrenceDateYmd: "2026-05-19",
      customerEmail: "sam@example.com",
      customerName: "Sam",
      customerPhone: "+27000",
    });
    expect(result.ok).toBe(true);
    const row = captured.inserts[0]!.row;
    expect(Object.prototype.hasOwnProperty.call(row, "selected_cleaner_id")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(row, "assignment_type")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(row, "cleaner_id")).toBe(false);
  });

  it("missing/invalid cleaner UUID does NOT break generation (drops it silently, returns ok)", async () => {
    const { admin, captured } = buildFakeBookingsAdmin();
    const result = await insertRecurringOccurrenceBooking(admin, {
      recurring: {
        id: RECURRING_PLAN_ID,
        customer_id: CUSTOMER_ID,
        price: 600,
        booking_snapshot_template: buildLockedTemplate({
          lockedCleanerId: "not-a-uuid",
          topCleanerId: "also-not-a-uuid",
        }),
        preferred_cleaner_id: "garbage",
      },
      occurrenceDateYmd: "2026-05-19",
      customerEmail: "sam@example.com",
      customerName: "Sam",
      customerPhone: "+27000",
    });
    expect(result.ok).toBe(true);
    const row = captured.inserts[0]!.row;
    expect(Object.prototype.hasOwnProperty.call(row, "selected_cleaner_id")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(row, "assignment_type")).toBe(false);
  });
});

describe("M-6: insertMonthlyRecurringOccurrenceBooking propagates preferred cleaner", () => {
  it("monthly path assigns the preferred cleaner immediately (pending + cleaner refs forbidden)", async () => {
    const { admin, captured } = buildFakeBookingsAdmin();
    const result = await insertMonthlyRecurringOccurrenceBooking(admin, {
      recurring: {
        id: RECURRING_PLAN_ID,
        customer_id: CUSTOMER_ID,
        price: 600,
        booking_snapshot_template: buildLockedTemplate(),
        preferred_cleaner_id: VALID_CLEANER_A,
      },
      occurrenceDateYmd: "2026-05-19",
      customerEmail: "sam@example.com",
      customerName: "Sam",
      customerPhone: "+27000",
    });
    expect(result.ok).toBe(true);
    const row = captured.inserts[0]!.row;
    expect(row.selected_cleaner_id).toBe(VALID_CLEANER_A);
    expect(row.cleaner_id).toBe(VALID_CLEANER_A);
    expect(row.assignment_type).toBe("user_selected");
    expect(row.status).toBe("assigned");
    expect(row.is_monthly_billing_booking).toBe(true);
    expect(row.billing_type).toBe("recurring_invoice");
    expect(row.payment_status).toBe("pending_monthly");
  });
});

describe("M-7: refreshRecurringPaymentStateForBooking detects orphan recurring_id", () => {
  beforeEach(() => {
    reportOpMock.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function buildFakeRefreshAdmin(opts: {
    booking: Record<string, unknown> | null;
    recurringLookup: { data: Record<string, unknown> | null; error: { message: string } | null };
  }) {
    const captured = { bookingUpdates: [] as Record<string, unknown>[], recurringSelectsForId: [] as string[] };
    const admin = {
      from(table: string) {
        if (table === "bookings") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: opts.booking, error: null }),
              }),
            }),
            update: (patch: Record<string, unknown>) => {
              captured.bookingUpdates.push(patch);
              return {
                eq: () => Promise.resolve({ error: null }),
              };
            },
          };
        }
        if (table === "recurring_bookings") {
          return {
            select: () => ({
              eq: (_col: string, val: string) => {
                captured.recurringSelectsForId.push(val);
                return {
                  maybeSingle: async () => opts.recurringLookup,
                };
              },
            }),
          };
        }
        throw new Error(`Unexpected table: ${table}`);
      },
    };
    return { admin: admin as unknown as Parameters<typeof refreshRecurringPaymentStateForBooking>[0], captured };
  }

  it("VALID PLAN: derives payment_state and reports NO operational issue (existing behaviour preserved)", async () => {
    const { admin, captured } = buildFakeRefreshAdmin({
      booking: {
        id: BOOKING_ID,
        is_recurring_generated: true,
        status: "pending_payment",
        payment_status: "pending",
        recurring_id: RECURRING_PLAN_ID,
        recurring_retry_count: 0,
      },
      recurringLookup: {
        data: { paystack_authorization_code: "auth_abc" },
        error: null,
      },
    });
    await refreshRecurringPaymentStateForBooking(admin, BOOKING_ID);
    expect(reportOpMock).not.toHaveBeenCalled();
    expect(captured.bookingUpdates).toHaveLength(1);
    expect(captured.bookingUpdates[0]).toEqual({ payment_state: "active_recurring" });
  });

  it("ORPHAN PLAN: rec=null with no error → reports `orphan_recurring_id` warn, still completes refresh", async () => {
    const { admin, captured } = buildFakeRefreshAdmin({
      booking: {
        id: BOOKING_ID,
        is_recurring_generated: true,
        status: "pending_payment",
        payment_status: "pending",
        recurring_id: RECURRING_PLAN_ID,
      },
      recurringLookup: { data: null, error: null },
    });
    await refreshRecurringPaymentStateForBooking(admin, BOOKING_ID);
    expect(reportOpMock).toHaveBeenCalledTimes(1);
    const [level, source, message, ctx] = reportOpMock.mock.calls[0] as [
      string,
      string,
      string,
      Record<string, unknown>,
    ];
    expect(level).toBe("warn");
    expect(source).toBe("refreshRecurringPaymentStateForBooking");
    expect(message).toBe("orphan_recurring_id_detected");
    expect(ctx.bookingId).toBe(BOOKING_ID);
    expect(ctx.recurringId).toBe(RECURRING_PLAN_ID);
    expect(ctx.errorType).toBe("orphan_recurring_id");
    expect(typeof ctx.remediation).toBe("string");
    expect(captured.bookingUpdates).toHaveLength(1);
    expect(captured.bookingUpdates[0]).toEqual({ payment_state: "active_recurring" });
  });

  it("TRANSIENT DB ERROR: reports a separate kind so ops can distinguish from true orphans", async () => {
    const { admin, captured } = buildFakeRefreshAdmin({
      booking: {
        id: BOOKING_ID,
        is_recurring_generated: true,
        status: "pending_payment",
        payment_status: "pending",
        recurring_id: RECURRING_PLAN_ID,
      },
      recurringLookup: { data: null, error: { message: "connection reset" } },
    });
    await refreshRecurringPaymentStateForBooking(admin, BOOKING_ID);
    expect(reportOpMock).toHaveBeenCalledTimes(1);
    const [, , message, ctx] = reportOpMock.mock.calls[0] as [
      string,
      string,
      string,
      Record<string, unknown>,
    ];
    expect(message).toBe("recurring_plan_lookup_failed");
    expect(ctx.errorType).toBe("recurring_plan_lookup_failed");
    expect(ctx.error).toBe("connection reset");
    expect(captured.bookingUpdates).toHaveLength(1);
  });

  it("NON-RECURRING booking: skips lookup entirely, never reports orphan", async () => {
    const { admin, captured } = buildFakeRefreshAdmin({
      booking: {
        id: BOOKING_ID,
        is_recurring_generated: false,
        status: "paid",
        payment_status: "success",
        recurring_id: null,
      },
      recurringLookup: { data: null, error: null },
    });
    await refreshRecurringPaymentStateForBooking(admin, BOOKING_ID);
    expect(reportOpMock).not.toHaveBeenCalled();
    expect(captured.recurringSelectsForId).toHaveLength(0);
    expect(captured.bookingUpdates).toEqual([{ payment_state: null }]);
  });

  it("NULL recurring_id on a recurring-generated booking: does NOT trigger orphan check", async () => {
    const { admin, captured } = buildFakeRefreshAdmin({
      booking: {
        id: BOOKING_ID,
        is_recurring_generated: true,
        status: "pending_payment",
        payment_status: "pending",
        recurring_id: null,
      },
      recurringLookup: { data: null, error: null },
    });
    await refreshRecurringPaymentStateForBooking(admin, BOOKING_ID);
    expect(reportOpMock).not.toHaveBeenCalled();
    expect(captured.recurringSelectsForId).toHaveLength(0);
    expect(captured.bookingUpdates).toHaveLength(1);
  });
});

describe("M-6 + M-7: static guards", () => {
  it("M-6 migration exists and adds preferred_cleaner_id with cleaner FK + ON DELETE SET NULL", () => {
    const sql = readSrc("supabase", "migrations", "20260943_m6_recurring_preferred_cleaner.sql");
    expect(sql).toContain("alter table public.recurring_bookings");
    expect(sql).toContain("add column if not exists preferred_cleaner_id");
    expect(sql).toContain("references public.cleaners (id)");
    expect(sql).toContain("on delete set null");
    expect(sql).toContain("recurring_bookings_preferred_cleaner_id_idx");
  });

  it("cron generate-recurring-bookings selects preferred_cleaner_id and forwards it to gateways", () => {
    const src = readSrc("apps", "web", "app", "api", "cron", "generate-recurring-bookings", "route.ts");
    expect(src).toContain("preferred_cleaner_id");
    const gatewayMatches = src.match(/preferred_cleaner_id: r\.preferred_cleaner_id/g) ?? [];
    expect(gatewayMatches.length).toBeGreaterThanOrEqual(2);
  });

  it("admin backfill helper selects preferred_cleaner_id and forwards it to gateways", () => {
    const src = readSrc("apps", "web", "lib", "recurring", "backfillRecurringOccurrencesToToday.ts");
    expect(src).toContain("preferred_cleaner_id");
    const gatewayMatches = src.match(/preferred_cleaner_id: r\.preferred_cleaner_id/g) ?? [];
    expect(gatewayMatches.length).toBeGreaterThanOrEqual(2);
  });

  it("both insert helpers import + use the resolution helper (single source of truth)", () => {
    const per = readSrc("apps", "web", "lib", "recurring", "insertRecurringOccurrenceBooking.ts");
    const monthly = readSrc("apps", "web", "lib", "recurring", "insertMonthlyRecurringOccurrenceBooking.ts");
    for (const src of [per, monthly]) {
      expect(src).toContain('from "@/lib/recurring/resolveRecurringPreferredCleanerId"');
      expect(src).toMatch(/resolveRecurringPreferredCleanerId\s*\(/);
      expect(src).toMatch(/recurringOccurrenceCleanerPatch\s*\(/);
    }
  });

  it("refresh helper imports reportOperationalIssue and emits the orphan signal", () => {
    const src = readSrc("apps", "web", "lib", "recurring", "refreshRecurringPaymentStateForBooking.ts");
    expect(src).toContain('from "@/lib/logging/systemLog"');
    expect(src).toContain("reportOperationalIssue");
    expect(src).toContain("orphan_recurring_id_detected");
    expect(src).toContain("recurring_plan_lookup_failed");
  });

  it("M-6 / M-7 do NOT touch payout formulas, schedule date generation, or billing math (constraint guard)", () => {
    const helper = readSrc("apps", "web", "lib", "recurring", "resolveRecurringPreferredCleanerId.ts");
    const refresh = readSrc("apps", "web", "lib", "recurring", "refreshRecurringPaymentStateForBooking.ts");
    for (const src of [helper, refresh]) {
      expect(src).not.toMatch(/calculateNextRunDate|occurrenceDatesInclusive|allocateMonthlyChildPaymentCents/);
      expect(src).not.toMatch(/cleaner_payout|payout_frozen_cents|display_earnings_cents/);
    }
  });
});
