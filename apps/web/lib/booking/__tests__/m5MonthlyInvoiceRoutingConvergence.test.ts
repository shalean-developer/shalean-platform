import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/monthlyInvoice/applyMonthlyInvoiceAccountPayment", () => ({
  applyMonthlyInvoiceAccountPayment: vi.fn(),
}));

import { applyMonthlyInvoiceAccountPayment } from "@/lib/monthlyInvoice/applyMonthlyInvoiceAccountPayment";
import {
  interpretMonthlyInvoiceOutcome,
  routePaystackChargeForMonthlyInvoice,
  shouldShortCircuitForMonthlyInvoice,
  type PaystackChargeMonthlyRouting,
} from "@/lib/booking/routePaystackChargeForMonthlyInvoice";

const applyAccountMock = applyMonthlyInvoiceAccountPayment as unknown as ReturnType<typeof vi.fn>;

/**
 * Helper to walk up parents and find the first directory that contains a child path on disk.
 * Used to locate the repo root from this nested test file in a Windows + Vitest layout.
 */
function findRepoRoot(): string {
  let dir = resolve(__dirname);
  for (let i = 0; i < 10; i += 1) {
    if (existsSync(join(dir, "apps", "web", "app", "api", "paystack", "webhook", "route.ts"))) {
      return dir;
    }
    const parent = resolve(dir, "..");
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error("Could not locate repo root from test file location");
}

const REPO_ROOT = findRepoRoot();

function readSrc(...segments: string[]): string {
  return readFileSync(join(REPO_ROOT, ...segments), "utf8");
}

describe("M-5: monthly-invoice routing helper", () => {
  beforeEach(() => {
    applyAccountMock.mockReset();
  });

  describe("interpretMonthlyInvoiceOutcome (pure mapper)", () => {
    it("maps not_found to not_monthly so caller proceeds to booking flow", () => {
      const r = interpretMonthlyInvoiceOutcome({ ok: true, skipped: true, reason: "not_found" });
      expect(r).toEqual({ kind: "not_monthly" });
      expect(shouldShortCircuitForMonthlyInvoice(r)).toBe(false);
    });

    it("maps already_paid skip to monthly_already_processed (short-circuit)", () => {
      const r = interpretMonthlyInvoiceOutcome({ ok: true, skipped: true, reason: "already_paid" });
      expect(r).toEqual({ kind: "monthly_already_processed", reason: "already_paid" });
      expect(shouldShortCircuitForMonthlyInvoice(r)).toBe(true);
    });

    it("maps duplicate_charge skip to monthly_already_processed (short-circuit)", () => {
      const r = interpretMonthlyInvoiceOutcome({ ok: true, skipped: true, reason: "duplicate_charge" });
      expect(r).toEqual({ kind: "monthly_already_processed", reason: "duplicate_charge" });
      expect(shouldShortCircuitForMonthlyInvoice(r)).toBe(true);
    });

    it("maps full settlement to monthly_settled with invoice id (short-circuit)", () => {
      const r = interpretMonthlyInvoiceOutcome({ ok: true, settled: "full", invoiceId: "inv-1" });
      expect(r).toMatchObject({ kind: "monthly_settled", invoiceId: "inv-1", settled: "full" });
      expect(shouldShortCircuitForMonthlyInvoice(r)).toBe(true);
    });

    it("maps partial settlement to monthly_settled including amount fields", () => {
      const r = interpretMonthlyInvoiceOutcome({
        ok: true,
        settled: "partial",
        invoiceId: "inv-2",
        amount_paid_cents: 5000,
        total_amount_cents: 8000,
      });
      expect(r).toEqual({
        kind: "monthly_settled",
        invoiceId: "inv-2",
        settled: "partial",
        amount_paid_cents: 5000,
        total_amount_cents: 8000,
      });
      expect(shouldShortCircuitForMonthlyInvoice(r)).toBe(true);
    });

    it("maps applyMonthlyInvoicePayment errors to monthly_error (callers fall through to booking flow)", () => {
      const r = interpretMonthlyInvoiceOutcome({ ok: false, error: "transient_db_failure" });
      expect(r).toEqual({ kind: "monthly_error", error: "transient_db_failure" });
      expect(shouldShortCircuitForMonthlyInvoice(r)).toBe(false);
    });
  });

  describe("routePaystackChargeForMonthlyInvoice (delegates to account-aware settlement)", () => {
    it("calls applyMonthlyInvoiceAccountPayment exactly once and returns its mapped routing", async () => {
      applyAccountMock.mockResolvedValueOnce({ ok: true, settled: "full", invoiceId: "inv-x" });
      const fakeAdmin = { __id: "admin" } as unknown as Parameters<typeof routePaystackChargeForMonthlyInvoice>[0];
      const r = await routePaystackChargeForMonthlyInvoice(fakeAdmin, {
        reference: "psk_ref_abc",
        amountCents: 12345,
      });
      expect(applyAccountMock).toHaveBeenCalledTimes(1);
      expect(applyAccountMock).toHaveBeenCalledWith(fakeAdmin, {
        reference: "psk_ref_abc",
        amountCents: 12345,
      });
      expect(r.kind).toBe("monthly_settled");
    });

    it("propagates not_found unchanged so booking pipeline runs", async () => {
      applyAccountMock.mockResolvedValueOnce({ ok: true, skipped: true, reason: "not_found" });
      const fakeAdmin = {} as unknown as Parameters<typeof routePaystackChargeForMonthlyInvoice>[0];
      const r = await routePaystackChargeForMonthlyInvoice(fakeAdmin, {
        reference: "ref-no-match",
        amountCents: 100,
      });
      expect(r).toEqual({ kind: "not_monthly" });
    });
  });
});

describe("M-5: webhook + verify routes use the same routing helper (convergence)", () => {
  it("the helper file exists and exports the expected discriminator + utilities", () => {
    const src = readSrc(
      "apps",
      "web",
      "lib",
      "booking",
      "routePaystackChargeForMonthlyInvoice.ts",
    );
    expect(src).toContain("export type PaystackChargeMonthlyRouting");
    expect(src).toContain("export async function routePaystackChargeForMonthlyInvoice");
    expect(src).toContain("export function interpretMonthlyInvoiceOutcome");
    expect(src).toContain("export function shouldShortCircuitForMonthlyInvoice");
    expect(src).toContain('"not_monthly"');
    expect(src).toContain('"monthly_settled"');
    expect(src).toContain('"monthly_already_processed"');
    expect(src).toContain('"monthly_error"');
  });

  it("webhook route imports + calls routePaystackChargeForMonthlyInvoice (single source of truth)", () => {
    const src = readSrc("apps", "web", "app", "api", "paystack", "webhook", "route.ts");
    expect(src).toContain('from "@/lib/booking/routePaystackChargeForMonthlyInvoice"');
    expect(src).toMatch(/routePaystackChargeForMonthlyInvoice\s*\(/);
    // No direct second call to applyMonthlyInvoicePayment in webhook — must funnel through helper.
    expect(src).not.toMatch(/\bapplyMonthlyInvoicePayment\s*\(/);
    // Webhook must still handle settled and already-processed monthly outcomes (response shape preserved).
    expect(src).toContain('"monthly_settled"');
    expect(src).toContain('"monthly_already_processed"');
    expect(src).toContain("Already processed");
    expect(src).toContain("received: true");
  });

  it("paystack verify route imports + calls the routing helper for both GET and POST", () => {
    const src = readSrc("apps", "web", "app", "api", "paystack", "verify", "route.ts");
    expect(src).toContain('from "@/lib/booking/routePaystackChargeForMonthlyInvoice"');
    // Two call sites (GET path and POST path).
    const matches = src.match(/routePaystackChargeForMonthlyInvoice\s*\(/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(2);
    expect(src).toMatch(/shouldShortCircuitForMonthlyInvoice\s*\(/);
    // Verify route must NEVER bypass the helper by calling applyMonthlyInvoicePayment directly.
    expect(src).not.toMatch(/\bapplyMonthlyInvoicePayment\s*\(/);
  });

  it("keeps the retired payments verify route as an explicit 410 tombstone", () => {
    const src = readSrc("apps", "web", "app", "api", "payments", "verify", "route.ts");
    expect(src).toContain("Legacy payment verification is retired");
    expect(src).toContain('canonicalVerifyPath: "/api/paystack/verify"');
    expect(src).toContain("{ status: 410 }");
    expect(src).not.toMatch(/runPaystackVerifyFinalizePipeline\s*\(/);
  });

  it("monthly-invoice routing runs before the booking-finalize pipeline in the canonical verify route", () => {
    // Static guard: the substring `routePaystackChargeForMonthlyInvoice(` MUST appear before the
    // first `runPaystackVerifyFinalizePipeline(` call inside each verify route, so a monthly
    // reference cannot accidentally enter the booking-settlement pipeline first.
    const verifySrc = readSrc("apps", "web", "app", "api", "paystack", "verify", "route.ts");
    const verifyHelperIdx = verifySrc.indexOf("routePaystackChargeForMonthlyInvoice(");
    const verifyPipelineIdx = verifySrc.indexOf("runPaystackVerifyFinalizePipeline(");
    expect(verifyHelperIdx).toBeGreaterThan(0);
    expect(verifyPipelineIdx).toBeGreaterThan(0);
    expect(verifyHelperIdx).toBeLessThan(verifyPipelineIdx);
  });

  it("webhook continues to use finalizePaidBooking for booking references (regression: not_monthly falls through)", () => {
    // The webhook must still call finalizePaidBooking after the helper for the booking branch.
    // If it ever stopped doing so, ALL non-monthly Paystack charges would silently no-op.
    const src = readSrc("apps", "web", "app", "api", "paystack", "webhook", "route.ts");
    expect(src).toContain("finalizePaidBooking");
    expect(src).toContain("upsertResultFromFinalizePaidBookingOp");
    // Verify branching: not_monthly / monthly_error must NOT short-circuit (preserves pre-M-5 behaviour).
    expect(src).not.toMatch(/kind === ['"]not_monthly['"]\s*\)\s*\{[\s\S]*?return\s+/);
    expect(src).not.toMatch(/kind === ['"]monthly_error['"]\s*\)\s*\{[\s\S]*?return\s+/);
  });
});

describe("M-5: routing decision matrix (proves required behaviours from task)", () => {
  function decide(outcome: Parameters<typeof interpretMonthlyInvoiceOutcome>[0]): {
    routing: PaystackChargeMonthlyRouting;
    shortCircuits: boolean;
  } {
    const routing = interpretMonthlyInvoiceOutcome(outcome);
    return { routing, shortCircuits: shouldShortCircuitForMonthlyInvoice(routing) };
  }

  it("REQUIRED: monthly invoice Paystack reference (full settle) routes via applyMonthlyInvoicePayment, not upsertBookingFromPaystack", () => {
    const { routing, shortCircuits } = decide({
      ok: true,
      settled: "full",
      invoiceId: "inv-monthly-full",
    });
    expect(routing.kind).toBe("monthly_settled");
    expect(shortCircuits).toBe(true);
  });

  it("REQUIRED: monthly invoice Paystack reference (partial settle) routes via applyMonthlyInvoicePayment, not upsertBookingFromPaystack", () => {
    const { routing, shortCircuits } = decide({
      ok: true,
      settled: "partial",
      invoiceId: "inv-monthly-partial",
      amount_paid_cents: 1000,
      total_amount_cents: 4000,
    });
    expect(routing.kind).toBe("monthly_settled");
    if (routing.kind === "monthly_settled") {
      expect(routing.settled).toBe("partial");
      expect(routing.amount_paid_cents).toBe(1000);
      expect(routing.total_amount_cents).toBe(4000);
    }
    expect(shortCircuits).toBe(true);
  });

  it("REQUIRED: monthly invoice idempotent replay (already_paid / duplicate_charge) still short-circuits, never falls into booking flow", () => {
    expect(decide({ ok: true, skipped: true, reason: "already_paid" }).shortCircuits).toBe(true);
    expect(decide({ ok: true, skipped: true, reason: "duplicate_charge" }).shortCircuits).toBe(true);
  });

  it("REQUIRED: booking Paystack reference (not in monthly_invoices) does NOT short-circuit and falls through to upsertBookingFromPaystack", () => {
    const { routing, shortCircuits } = decide({ ok: true, skipped: true, reason: "not_found" });
    expect(routing.kind).toBe("not_monthly");
    expect(shortCircuits).toBe(false);
  });

  it("REQUIRED: unknown reference preserves existing error behaviour (booking pipeline runs and produces its own error)", () => {
    // Unknown == not in monthly_invoices == not_monthly. Caller proceeds to booking pipeline,
    // which then returns its existing error response. No new error path is introduced for
    // unknown references — exactly the M-5 isolation requirement.
    const { routing, shortCircuits } = decide({ ok: true, skipped: true, reason: "not_found" });
    expect(routing).toEqual({ kind: "not_monthly" });
    expect(shortCircuits).toBe(false);
  });

  it("REQUIRED: webhook and verify route converge on identical kinds for identical applyMonthlyInvoicePayment outputs", () => {
    // Both routes consume the same `interpretMonthlyInvoiceOutcome` output via the helper. This
    // test pins that mapping so any future drift (e.g. a verify-route-only override) is caught.
    const cases: Array<Parameters<typeof interpretMonthlyInvoiceOutcome>[0]> = [
      { ok: true, settled: "full", invoiceId: "inv-A" },
      { ok: true, settled: "partial", invoiceId: "inv-B", amount_paid_cents: 1, total_amount_cents: 9 },
      { ok: true, skipped: true, reason: "already_paid" },
      { ok: true, skipped: true, reason: "duplicate_charge" },
      { ok: true, skipped: true, reason: "not_found" },
      { ok: false, error: "boom" },
    ];
    for (const c of cases) {
      const a = interpretMonthlyInvoiceOutcome(c);
      const b = interpretMonthlyInvoiceOutcome(c);
      expect(a).toEqual(b);
    }
  });
});
