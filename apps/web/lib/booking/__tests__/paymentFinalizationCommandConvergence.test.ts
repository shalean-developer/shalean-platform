import type { SupabaseClient } from "@supabase/supabase-js";
import { finalizePendingPaymentBookingFromPaystack, insertFinalizedBookingFromPaystack, updateObservedPendingPaymentBooking, type PaymentFinalizationObservedPendingBooking } from "@/lib/booking/paymentFinalizationBookingCommands";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

const bookingDir = path.resolve(__dirname, "..");
const command = path.join(bookingDir, "paymentFinalizationBookingCommands.ts");
const paystack = path.join(bookingDir, "upsertBookingFromPaystack.ts");
const manual = path.join(bookingDir, "adminMarkBookingPaid.ts");

const intentionallyUnmigrated = [
  path.join(bookingDir, "checkoutDispatchOfferFailureFallback.ts"),
  path.join(bookingDir, "adminEditBookingDetails.ts"),
  path.resolve(__dirname, "../../cleaner/runCleanerBookingLifecycleAction.ts"),
  path.resolve(__dirname, "../../payout/backfillCompletedMissingDisplayEarnings.ts"),
  path.resolve(__dirname, "../../monthlyInvoice/finalizeDueMonthlyInvoices.ts"),
  path.resolve(__dirname, "../../monthlyInvoice/applyMonthlyInvoicePayment.ts"),
  path.resolve(__dirname, "../../monthlyInvoice/markMonthlyInvoicePaidManual.ts"),
];

describe("payment finalization booking command convergence (Phase 1F)", () => {
  it("owns the Paystack pending-payment finalization update shape", () => {
    const src = readFileSync(command, "utf8");

    expect(src).toContain("finalizePendingPaymentBookingFromPaystack");
    expect(src).toContain("ownershipColumn");
    expect(src).toContain("paymentFinalizationSelect");
    expect(src).toContain('row: normalizePaystackFinalizationPaidAmountRow(params.row)');
    expect(src).toContain('.eq("id", observed.id)');
    expect(src).toContain('.eq("status", observed.status)');

  });

  it("owns the Paystack finalized booking insert shape", () => {
    const src = readFileSync(command, "utf8");

    expect(src).toContain("insertFinalizedBookingFromPaystack");
    expect(src).toMatch(/\.from\("bookings"\)[\s\S]*?\.insert\(normalizedRow\)[\s\S]*?\.select\(paymentFinalizationSelect\(params\.ownershipColumn\)\)[\s\S]*?\.maybeSingle\(\)/);
  });

  it("owns the manual mark-paid guarded update shape", () => {
    const src = readFileSync(command, "utf8");

    expect(src).toContain("markBookingPaidFromAdminSettlement");
    expect(src).toMatch(/\.from\("bookings"\)[\s\S]*?\.update\(params\.patch\)[\s\S]*?\.eq\("id",\s*params\.bookingId\)[\s\S]*?\.is\("payment_completed_at",\s*null\)[\s\S]*?\.not\("status",\s*"eq",\s*"cancelled"\)[\s\S]*?\.not\("status",\s*"eq",\s*"failed"\)[\s\S]*?\.select\("id"\)/);
  });

  it("migrates only the safest Paystack and manual payment finalization call sites", () => {
    const paystackSrc = readFileSync(paystack, "utf8");
    const manualSrc = readFileSync(manual, "utf8");

    expect(paystackSrc).toContain("finalizePendingPaymentBookingFromPaystack");
    expect(paystackSrc).toContain("insertFinalizedBookingFromPaystack");
    expect(paystackSrc).not.toMatch(/const\s+updateBuilder\s*=/);
    expect(paystackSrc).not.toMatch(/\.from\("bookings"\)[\s\S]*?\.insert\(row\)[\s\S]*?\.select\("id, created_at, user_id"\)/);

    expect(manualSrc).toContain("markBookingPaidFromAdminSettlement");
    expect(manualSrc).not.toMatch(/\.from\("bookings"\)[\s\S]*?\.update\(patch\)[\s\S]*?\.is\("payment_completed_at",\s*null\)/);
  });

  it("keeps selected-cleaner, auto-dispatch, idempotency, and metadata behavior outside the wrappers", () => {
    const commandSrc = readFileSync(command, "utf8");
    const paystackSrc = readFileSync(paystack, "utf8");
    const manualSrc = readFileSync(manual, "utf8");

    expect(commandSrc).not.toContain("resolveCheckoutCleanerSelection");
    expect(commandSrc).not.toContain("assignBestCleaner");
    expect(commandSrc).not.toContain("runAdminAssignSmart");
    expect(commandSrc).not.toContain("parseCheckoutPriceSnapshotV1FromMeta");
    expect(commandSrc).not.toContain("tryClaimNotificationDedupe");

    expect(paystackSrc).toContain("resolveCheckoutCleanerSelection");
    expect(paystackSrc).toContain("assignBestCleaner");
    expect(paystackSrc).toContain("runAdminAssignSmart");
    expect(paystackSrc).toContain("parseCheckoutPriceSnapshotV1FromMeta");
    expect(manualSrc).toContain("tryClaimNotificationDedupe");
  });

  it("leaves assignment, cleaner lifecycle, payout repair, and monthly invoice paths out of Phase 1F", () => {
    for (const p of intentionallyUnmigrated) {
      const src = readFileSync(p, "utf8");
      expect(src, `${path.basename(p)} must not use payment finalization commands`).not.toContain(
        "paymentFinalizationBookingCommands",
      );
    }
  });
});

describe("Paystack finalization paid-amount normalization", () => {
  function databaseStub() {
    const query = {
      update: vi.fn(),
      insert: vi.fn(),
      eq: vi.fn(),
      is: vi.fn(),
      select: vi.fn(),
      maybeSingle: vi.fn().mockResolvedValue({ data: { id: "booking-test" }, error: null }),
    };
    query.update.mockReturnValue(query);
    query.insert.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    query.is.mockReturnValue(query);
    query.select.mockReturnValue(query);
    const from = vi.fn().mockReturnValue(query);
    return { from, query, client: { from } as unknown as SupabaseClient };
  }

  for (const mode of ["id", "paystack_reference", "insert"] as const) {
    async function persist(db: ReturnType<typeof databaseStub>, row: Record<string, unknown>) {
      if (mode === "insert") {
        return insertFinalizedBookingFromPaystack({ supabase: db.client, row, ownershipColumn: "customer_id" });
      }
      return finalizePendingPaymentBookingFromPaystack({
        supabase: db.client,
        row,
        ownershipColumn: "customer_id",
        observed: {
          id: "booking-test", status: "pending_payment",
          customerEmail: "customer@example.com", customerAuthId: "owner-test",
          paystackReference: "test-reference",
        },
      });
    }

    it.each([[12_550, 126], [9_940, 99], [180_250, 1803], [10_000, 100], [0, 0]])(
      mode + " writes %s exact cents and overwrites stale mirrors",
      async (cents, mirror) => {
        const db = databaseStub();
        const row = {
          amount_paid_cents: cents, total_paid_cents: 777, total_paid_zar: 999.99,
          customer_id: "owner-test", customer_email: "customer@example.com",
          status: "pending", payment_status: "success",
        };
        const result = await persist(db, row);
        expect(result.error).toBeNull();
        expect(result.data?.id).toBe("booking-test");
        const write = mode === "insert" ? db.query.insert : db.query.update;
        expect(write).toHaveBeenCalledExactlyOnceWith({
          ...row, amount_paid_cents: cents, total_paid_cents: cents, total_paid_zar: mirror,
        });
        expect(row.total_paid_cents).toBe(777);
        expect(row.total_paid_zar).toBe(999.99);
        if (mode !== "insert") {
          expect(db.query.eq.mock.calls).toEqual([
            ["id", "booking-test"],
            ["status", "pending_payment"],
            ["customer_email", "customer@example.com"],
            ["customer_id", "owner-test"],
            ["paystack_reference", "test-reference"],
          ]);
        }
      },
    );

    it.each([-1, 0.5, NaN, Infinity, -Infinity, 2_147_483_648, "12550", null, undefined])(
      mode + " rejects invalid cents %s before any database call",
      async (input) => {
        const db = databaseStub();
        await expect(persist(db, {
          amount_paid_cents: input, total_paid_cents: 12550, total_paid_zar: 125.5,
        })).rejects.toThrow("Invalid collected-cash cents");
        expect(db.from).not.toHaveBeenCalled();
        expect(db.query.update).not.toHaveBeenCalled();
        expect(db.query.insert).not.toHaveBeenCalled();
      },
    );
  }
});

describe("observed-state payment writes", () => {
  const anchor: PaymentFinalizationObservedPendingBooking = {
    id: "booking-test", status: "pending_payment", customerEmail: " Customer@Example.com ",
    customerAuthId: "owner-a", paystackReference: "old-reference",
  };
  // Simulates a database evaluating the complete WHERE clause after a competing write.
  function database(observed: typeof anchor, competing: Record<string, unknown> = {}, owner = "customer_id") {
    const current: Record<string, unknown> = {
      id: observed.id, status: observed.status, customer_email: observed.customerEmail,
      [owner]: observed.customerAuthId, paystack_reference: observed.paystackReference, ...competing,
    };
    const predicates: Array<[string, string, unknown]> = [];
    let payload: Record<string, unknown> = {};
    const query = {
      update: vi.fn((patch: Record<string, unknown>) => { payload = patch; return query; }),
      eq: vi.fn((key: string, value: unknown) => { predicates.push(["eq", key, value]); return query; }),
      is: vi.fn((key: string, value: unknown) => { predicates.push(["is", key, value]); return query; }),
      select: vi.fn(() => query),
      maybeSingle: vi.fn(async () => {
        if (!predicates.every(([, key, value]) => current[key] === value)) return { data: null, error: null };
        Object.assign(current, payload);
        return { data: { id: current.id }, error: null };
      }),
    };
    const from = vi.fn(() => query);
    return { current, predicates, query, from, client: { from } as unknown as SupabaseClient };
  }
  for (const ownershipColumn of ["customer_id", "user_id"] as const) {
    for (const mode of ["paystack_reference", "id"] as const) {
      const observed = { ...anchor, paystackReference: mode === "id" ? anchor.id : "test-reference" };
      const row = {
        customer_email: "customer@example.com", [ownershipColumn]: "owner-a",
        paystack_reference: "pay_verified", amount_paid_cents: 12550,
        total_paid_cents: 1, total_paid_zar: 1.5,
      };
      it(mode + "/" + ownershipColumn + " pins raw fields and permits reference replacement", async () => {
        const db = database(observed, {}, ownershipColumn);
        const result = await finalizePendingPaymentBookingFromPaystack({
          supabase: db.client, observed, row, ownershipColumn,
        });
        expect(result.error).toBeNull();
        expect(db.predicates).toEqual([
          ["eq", "id", observed.id], ["eq", "status", "pending_payment"],
          ["eq", "customer_email", observed.customerEmail],
          ["eq", ownershipColumn, observed.customerAuthId],
          ["eq", "paystack_reference", observed.paystackReference],
        ]);
        expect(db.current).toMatchObject({
          paystack_reference: "pay_verified", amount_paid_cents: 12550,
          total_paid_cents: 12550, total_paid_zar: 126,
        });
      });
      it.each([
        { customer_email: "other@example.com" },
        { [ownershipColumn]: "owner-b" },
        { paystack_reference: "another-reference" },
        { status: "cancelled" },
        { id: "another-booking" },
      ])(mode + "/" + ownershipColumn + " rejects a competing mutation %j", async (competing) => {
        const db = database(observed, competing, ownershipColumn);
        const before = { ...db.current };
        const result = await finalizePendingPaymentBookingFromPaystack({
          supabase: db.client, observed, row, ownershipColumn,
        });
        expect(result.data).toBeNull();
        expect(result.error?.code).toBe("PAYMENT_FINALIZATION_CONFLICT");
        expect(db.current).toEqual(before);
      });
      it(mode + "/" + ownershipColumn + " uses explicit NULL predicates and permits legacy fill", async () => {
        const missing = { ...observed, customerEmail: null, customerAuthId: null, paystackReference: null };
        const db = database(missing, {}, ownershipColumn);
        expect((await finalizePendingPaymentBookingFromPaystack({
          supabase: db.client, observed: missing, row, ownershipColumn,
        })).error).toBeNull();
        expect(db.query.is.mock.calls).toEqual([
          ["customer_email", null], [ownershipColumn, null], ["paystack_reference", null],
        ]);
      });
      it(mode + "/" + ownershipColumn + " preserves missing incoming identity", async () => {
        const db = database(observed, {}, ownershipColumn);
        await finalizePendingPaymentBookingFromPaystack({
          supabase: db.client, observed, row: { ...row, customer_email: "", [ownershipColumn]: null }, ownershipColumn,
        });
        expect(db.current.customer_email).toBe(observed.customerEmail);
        expect(db.current[ownershipColumn]).toBe(observed.customerAuthId);
      });
      it.each([{ customer_email: "wrong@example.com" }, { [ownershipColumn]: "wrong-owner" }])(
        mode + "/" + ownershipColumn + " rejects identity mismatch without UPDATE %j", async (badIdentity) => {
          const db = database(observed, {}, ownershipColumn);
          const result = await finalizePendingPaymentBookingFromPaystack({
            supabase: db.client, observed, row: { ...row, ...badIdentity }, ownershipColumn,
          });
          expect(result.error?.code).toBe("PAYMENT_CUSTOMER_IDENTITY_MISMATCH");
          expect(db.from).not.toHaveBeenCalled();
        },
      );
    }
  }
  it("mismatch/reconciliation writes share the same zero-row conflict contract", async () => {
    const db = database(anchor, { customer_id: "claimed-owner" });
    const result = await updateObservedPendingPaymentBooking({
      supabase: db.client, observed: anchor, row: { status: "payment_mismatch" }, ownershipColumn: "customer_id",
    });
    expect(result.error?.code).toBe("PAYMENT_FINALIZATION_CONFLICT");
    expect(db.current.status).toBe("pending_payment");
  });
});
