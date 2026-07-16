import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import { decideRefundAmount, maskPaymentReference } from "@/lib/booking/refund/refundRules";
import {
  assertRefundProviderTransition,
  canTransitionRefundProviderState,
  isGovernedBookingPaymentStatus,
  paymentStatusForAggregate,
  resolveRefundAggregateStatus,
} from "@/lib/booking/refund/refundStateMachine";
import {
  assertRefundReconciliation,
  refundGatewayReference,
} from "@/lib/booking/refund/refundReconciliation";
import {
  evaluateRefundMakerChecker,
  refundMakerCheckerEnabled,
} from "@/lib/booking/refund/refundMakerChecker";
import {
  buildRefundBookingSelect,
  buildRefundClawbackBookingSelect,
} from "@/lib/booking/refund/refundBookingSelect";
import {
  initRefundWorkflow,
  priorSucceededRefundedCents,
  upsertRefundRecord,
  type BookingRefundRecord,
} from "@/lib/booking/refund/refundSnapshot";

describe("Princess PR D refund rules", () => {
  it("allows full refund of remaining", () => {
    const d = decideRefundAmount({ capturedCents: 50_000, priorRefundedCents: 0 });
    expect(d.ok).toBe(true);
    if (d.ok) {
      expect(d.kind).toBe("full");
      expect(d.requestedCents).toBe(50_000);
    }
  });

  it("allows partial then remaining full", () => {
    const first = decideRefundAmount({
      capturedCents: 50_000,
      priorRefundedCents: 0,
      requestedCents: 20_000,
    });
    expect(first.ok && first.kind).toBe("partial");
    const second = decideRefundAmount({
      capturedCents: 50_000,
      priorRefundedCents: 20_000,
      requestedCents: 30_000,
    });
    expect(second.ok && second.kind).toBe("full");
  });

  it("rejects over-refund", () => {
    const d = decideRefundAmount({
      capturedCents: 50_000,
      priorRefundedCents: 40_000,
      requestedCents: 20_000,
    });
    expect(d.ok).toBe(false);
    if (!d.ok) expect(d.error).toBe("amount_exceeds_refundable");
  });

  it("rejects currency mismatch", () => {
    const d = decideRefundAmount({
      capturedCents: 10_000,
      priorRefundedCents: 0,
      currency: "USD",
    });
    expect(d.ok).toBe(false);
    if (!d.ok) expect(d.error).toBe("currency_mismatch");
  });

  it("masks payment references", () => {
    expect(maskPaymentReference("psk_abcdef123456")).toMatch(/^psk_…/);
  });
});

describe("Princess PR D refund state machine", () => {
  it("allows submitted → pending → succeeded", () => {
    expect(canTransitionRefundProviderState("submitted_to_provider", "pending")).toBe(true);
    expect(canTransitionRefundProviderState("pending", "succeeded")).toBe(true);
    expect(assertRefundProviderTransition("succeeded", "failed").ok).toBe(false);
  });

  it("keeps capture payment_status schema-valid under full/partial/chargeback (MODEL A)", () => {
    expect(resolveRefundAggregateStatus({ capturedCents: 100, refundedCents: 100 })).toBe("full");
    expect(paymentStatusForAggregate("full", "success")).toBe("success");
    expect(paymentStatusForAggregate("partial", "success")).toBe("success");
    expect(paymentStatusForAggregate("chargeback", "success")).toBe("success");
    expect(paymentStatusForAggregate("full", "pending_monthly")).toBe("pending_monthly");
    // Legacy illegal value never re-written
    expect(paymentStatusForAggregate("full", "refunded")).toBe("success");
    for (const aggregate of ["full", "partial", "chargeback", "none"] as const) {
      expect(isGovernedBookingPaymentStatus(paymentStatusForAggregate(aggregate, "success"))).toBe(
        true,
      );
    }
  });
});

describe("Princess PR D refund reconciliation", () => {
  it("nets to zero on full refund with matching ledger lines", () => {
    const r = assertRefundReconciliation({
      capturedCents: 40_000,
      refundedCents: 40_000,
      currency: "ZAR",
      ledgerLines: [
        { kind: "capture", amountCents: 40_000, currency: "ZAR", gatewayReference: "chg_1" },
        { kind: "refund", amountCents: 25_000, currency: "ZAR", gatewayReference: "refund:chg_1:a" },
        { kind: "refund", amountCents: 15_000, currency: "ZAR", gatewayReference: "refund:chg_1:b" },
      ],
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.netCents).toBe(0);
  });

  it("rejects duplicate refund references and over-refund", () => {
    expect(
      assertRefundReconciliation({
        capturedCents: 10_000,
        refundedCents: 12_000,
        currency: "ZAR",
        ledgerLines: [],
      }).ok,
    ).toBe(false);
    expect(
      assertRefundReconciliation({
        capturedCents: 10_000,
        refundedCents: 10_000,
        currency: "ZAR",
        ledgerLines: [
          { kind: "refund", amountCents: 5_000, currency: "ZAR", gatewayReference: "dup" },
          { kind: "refund", amountCents: 5_000, currency: "ZAR", gatewayReference: "dup" },
        ],
      }).ok,
    ).toBe(false);
  });

  it("builds unique gateway references per refund id", () => {
    expect(refundGatewayReference({ chargeReference: "abc", refundId: "rfnd_1" })).toBe(
      "refund:abc:rfnd_1",
    );
  });
});

describe("Princess PR D maker-checker", () => {
  const envKeys = ["REFUND_MAKER_CHECKER", "PAYOUT_MAKER_CHECKER", "REFUND_ALLOW_SELF_APPROVE"] as const;
  const prev: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const k of envKeys) prev[k] = process.env[k];
  });
  afterEach(() => {
    for (const k of envKeys) {
      if (prev[k] === undefined) delete process.env[k];
      else process.env[k] = prev[k];
    }
  });

  it("proposes when enabled and no proposal id", () => {
    process.env.REFUND_MAKER_CHECKER = "true";
    expect(refundMakerCheckerEnabled()).toBe(true);
    const g = evaluateRefundMakerChecker({
      enabled: true,
      adminUserId: "admin-a",
      pendingProposal: null,
      requestedAmountCents: 10_000,
    });
    expect(g.ok && g.mode).toBe("propose");
  });

  it("rejects self-approval", () => {
    const g = evaluateRefundMakerChecker({
      enabled: true,
      adminUserId: "admin-a",
      proposalId: "p1",
      pendingProposal: {
        id: "p1",
        proposed_by: "admin-a",
        expires_at: new Date(Date.now() + 60_000).toISOString(),
        amount_cents: 10_000,
      },
      requestedAmountCents: 10_000,
    });
    expect(g.ok).toBe(false);
    if (!g.ok) expect(g.code).toBe("maker_checker_self_approve");
  });

  it("allows different approver", () => {
    const g = evaluateRefundMakerChecker({
      enabled: true,
      adminUserId: "admin-b",
      proposalId: "p1",
      pendingProposal: {
        id: "p1",
        proposed_by: "admin-a",
        expires_at: new Date(Date.now() + 60_000).toISOString(),
        amount_cents: 10_000,
      },
      requestedAmountCents: 10_000,
    });
    expect(g.ok && g.mode).toBe("approve");
  });

  it("rejects amount mutation on approval (immutable proposal snapshot)", () => {
    const g = evaluateRefundMakerChecker({
      enabled: true,
      adminUserId: "admin-b",
      proposalId: "p1",
      pendingProposal: {
        id: "p1",
        proposed_by: "admin-a",
        expires_at: new Date(Date.now() + 60_000).toISOString(),
        amount_cents: 10_000,
      },
      requestedAmountCents: 15_000,
    });
    expect(g.ok).toBe(false);
    if (!g.ok) expect(g.code).toBe("proposal_mismatch");
  });

  it("disabled/missing config uses direct mode (no silent bypass of amount rules)", () => {
    delete process.env.REFUND_MAKER_CHECKER;
    delete process.env.PAYOUT_MAKER_CHECKER;
    expect(refundMakerCheckerEnabled()).toBe(false);
    const g = evaluateRefundMakerChecker({
      enabled: false,
      adminUserId: "admin-a",
      pendingProposal: null,
      requestedAmountCents: 10_000,
    });
    expect(g.ok && g.mode).toBe("direct");
  });

  it("explicit false disables even when PAYOUT_MAKER_CHECKER is true", () => {
    process.env.REFUND_MAKER_CHECKER = "false";
    process.env.PAYOUT_MAKER_CHECKER = "true";
    expect(refundMakerCheckerEnabled()).toBe(false);
  });
});

describe("Princess PR D schema-aware ownership select", () => {
  it("builds customer_id select for current staging schema", () => {
    const select = buildRefundBookingSelect("customer_id");
    expect(select).toContain("customer_id");
    expect(select).not.toMatch(/(^|,\s*)user_id(,|$)/);
  });

  it("builds legacy user_id select only when schema requires it", () => {
    const select = buildRefundBookingSelect("user_id");
    expect(select).toContain("user_id");
    expect(select).not.toContain("customer_id");
  });

  it("clawback select follows the same ownership column", () => {
    expect(buildRefundClawbackBookingSelect("customer_id")).toBe(
      "id, customer_id, customer_email, status, refunded_at, refund_status",
    );
    expect(buildRefundClawbackBookingSelect("user_id")).toBe(
      "id, user_id, customer_email, status, refunded_at, refund_status",
    );
  });

  it("refundBookingPayment source resolves ownership and does not hardcode bookings.user_id", () => {
    const src = readFileSync(
      resolve(__dirname, "../refundBookingPayment.ts"),
      "utf8",
    );
    expect(src).toMatch(/resolveBookingOwnershipColumn/);
    expect(src).toMatch(/buildRefundBookingSelect\(ownershipColumn\)/);
    // Legacy hardcoded select fragment must not return.
    expect(src).not.toContain("monthly_invoice_id, user_id, customer_email");
    expect(src).not.toMatch(/\.select\(\s*["'][^"']*\buser_id\b[^"']*["']/);
  });

  it("clawback source resolves ownership and does not hardcode bookings.user_id", () => {
    const src = readFileSync(resolve(__dirname, "../../../../lib/referrals/clawback.ts"), "utf8");
    expect(src).toMatch(/resolveBookingOwnershipColumn/);
    expect(src).toMatch(/buildRefundClawbackBookingSelect\(ownershipColumn\)/);
    expect(src).toMatch(/bookingCustomerKey/);
    expect(src).not.toContain('.select("id, user_id, customer_email');
  });
});

describe("Princess PR D refund snapshot accumulation", () => {
  it("accumulates succeeded refunds without exceeding capture", () => {
    let wf = initRefundWorkflow({ capturedCents: 50_000 });
    const base = (id: string, amount: number): BookingRefundRecord => ({
      id,
      amount_cents: amount,
      currency: "ZAR",
      kind: amount >= 50_000 ? "full" : "partial",
      reason: "test",
      cancellation_reason: null,
      provider_state: "succeeded",
      provider_reference: null,
      provider_outcome: "succeeded",
      record_only: true,
      requested_by: "a",
      requested_by_email: null,
      approved_by: null,
      approved_by_email: null,
      retry_count: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      succeeded_at: new Date().toISOString(),
      failed_at: null,
    });
    wf = upsertRefundRecord(wf, base("r1", 20_000));
    wf = upsertRefundRecord(wf, base("r2", 30_000));
    expect(priorSucceededRefundedCents(wf)).toBe(50_000);
    const next = decideRefundAmount({
      capturedCents: wf.captured_cents,
      priorRefundedCents: priorSucceededRefundedCents(wf),
    });
    expect(next.ok).toBe(false);
  });
});

describe("Princess PR D refundBookingPayment integration (mocked provider)", () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.REFUND_MAKER_CHECKER;
    delete process.env.PAYOUT_MAKER_CHECKER;
    vi.doMock("@/lib/customer/customerBookingsForUser", () => ({
      resolveBookingOwnershipColumn: vi.fn(async () => "customer_id" as const),
      resetBookingOwnershipColumnCacheForTests: vi.fn(),
    }));
  });

  function makeAdminMock(initial: Record<string, unknown>) {
    let row = { ...initial };
    const updates: Record<string, unknown>[] = [];
    const inserts: Record<string, unknown>[] = [];
    const selectCalls: string[] = [];

    const from = (table: string) => {
      if (table === "bookings") {
        return {
          select: (cols?: string) => {
            if (typeof cols === "string") selectCalls.push(cols);
            return {
              eq: () => ({
                maybeSingle: async () => ({ data: row, error: null }),
              }),
              limit: async () => ({ data: [row], error: null }),
            };
          },
          update: (patch: Record<string, unknown>) => ({
            eq: async () => {
              updates.push(patch);
              row = { ...row, ...patch };
              return { error: null };
            },
          }),
        };
      }
      if (table === "payment_transactions") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: null, error: null }),
              }),
            }),
          }),
          insert: (payload: Record<string, unknown>) => {
            inserts.push(payload);
            return {
              select: () => ({
                single: async () => ({ data: { id: `pt_${inserts.length}` }, error: null }),
              }),
            };
          },
        };
      }
      return {};
    };

    return {
      from,
      getRow: () => row,
      updates,
      inserts,
      selectCalls,
    };
  }

  it("records successful full refund with ledger line (customer_id ownership)", async () => {
    vi.doMock("@/lib/paystack/refundPaystackTransaction", () => ({
      refundPaystackTransaction: vi.fn(async () => ({
        ok: true,
        refundReference: "rf_full_1",
      })),
    }));
    vi.doMock("@/lib/referrals/clawback", () => ({
      maybeProcessReferralClawbackOnBookingChange: vi.fn(async () => undefined),
    }));
    vi.doMock("@/lib/logging/systemLog", () => ({
      logSystemEvent: vi.fn(async () => undefined),
    }));

    const { refundBookingPayment } = await import("@/lib/booking/refund/refundBookingPayment");
    const admin = makeAdminMock({
      id: "bk_1",
      status: "completed",
      payment_status: "success",
      paystack_reference: "psk_charge_1",
      amount_paid_cents: 45_000,
      total_paid_cents: 45_000,
      total_paid_zar: 450,
      refunded_at: null,
      refund_status: null,
      monthly_invoice_id: null,
      customer_id: "cust-1",
      customer_email: "c@example.com",
      booking_snapshot: {},
      currency: "ZAR",
    });

    const result = await refundBookingPayment(admin as never, {
      bookingId: "bk_1",
      note: "customer request",
      adminUserId: "admin-1",
      adminEmail: "ops@shalean.co.za",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.mode).toBe("applied");
    expect(result.refundStatus).toBe("full");
    // MODEL A: capture payment_status stays schema-valid; refund_status carries full.
    expect(admin.getRow().payment_status).toBe("success");
    expect(isGovernedBookingPaymentStatus(admin.getRow().payment_status)).toBe(true);
    expect(admin.getRow().refund_status).toBe("full");
    expect(admin.getRow().status).toBe("completed");
    expect(admin.inserts.length).toBe(1);
    expect(String(admin.inserts[0]?.gateway_reference)).toMatch(/^refund:psk_charge_1:/);
    expect(admin.inserts[0]?.settlement_status).toBe("reversed");
    expect(admin.selectCalls.some((c) => c.includes("customer_id"))).toBe(true);
    expect(admin.selectCalls.every((c) => !/(^|,\s*)user_id(,|$)/.test(c))).toBe(true);
  });

  it("supports cumulative partial refunds", async () => {
    vi.doMock("@/lib/paystack/refundPaystackTransaction", () => ({
      refundPaystackTransaction: vi.fn(async (p: { amountCents?: number }) => ({
        ok: true,
        refundReference: `rf_${p.amountCents ?? "full"}`,
      })),
    }));
    vi.doMock("@/lib/referrals/clawback", () => ({
      maybeProcessReferralClawbackOnBookingChange: vi.fn(async () => undefined),
    }));
    vi.doMock("@/lib/logging/systemLog", () => ({
      logSystemEvent: vi.fn(async () => undefined),
    }));

    const { refundBookingPayment } = await import("@/lib/booking/refund/refundBookingPayment");
    const admin = makeAdminMock({
      id: "bk_2",
      status: "completed",
      payment_status: "success",
      paystack_reference: "psk_charge_2",
      amount_paid_cents: 40_000,
      total_paid_cents: 40_000,
      total_paid_zar: 400,
      refunded_at: null,
      refund_status: null,
      monthly_invoice_id: null,
      customer_id: "cust-1",
      customer_email: "c@example.com",
      booking_snapshot: {},
      currency: "ZAR",
    });

    const first = await refundBookingPayment(admin as never, {
      bookingId: "bk_2",
      amountCents: 15_000,
      note: "partial 1",
      adminUserId: "admin-1",
    });
    expect(first.ok && first.refundStatus).toBe("partial");

    const second = await refundBookingPayment(admin as never, {
      bookingId: "bk_2",
      amountCents: 25_000,
      note: "partial 2 completes",
      adminUserId: "admin-1",
    });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.refundStatus).toBe("full");
    expect(admin.getRow().payment_status).toBe("success");
    expect(admin.getRow().refund_status).toBe("full");
    expect(admin.inserts.length).toBe(2);
  });

  it("rejects duplicate full refund", async () => {
    vi.doMock("@/lib/paystack/refundPaystackTransaction", () => ({
      refundPaystackTransaction: vi.fn(async () => ({ ok: true, refundReference: "rf" })),
    }));
    vi.doMock("@/lib/referrals/clawback", () => ({
      maybeProcessReferralClawbackOnBookingChange: vi.fn(async () => undefined),
    }));
    vi.doMock("@/lib/logging/systemLog", () => ({
      logSystemEvent: vi.fn(async () => undefined),
    }));

    const { refundBookingPayment } = await import("@/lib/booking/refund/refundBookingPayment");
    const admin = makeAdminMock({
      id: "bk_3",
      status: "completed",
      payment_status: "success",
      paystack_reference: "psk_3",
      amount_paid_cents: 10_000,
      total_paid_cents: 10_000,
      total_paid_zar: 100,
      refunded_at: null,
      refund_status: null,
      monthly_invoice_id: null,
      customer_id: null,
      customer_email: null,
      booking_snapshot: {},
      currency: "ZAR",
    });

    expect((await refundBookingPayment(admin as never, { bookingId: "bk_3", note: "a" })).ok).toBe(
      true,
    );
    const dup = await refundBookingPayment(admin as never, { bookingId: "bk_3", note: "b" });
    expect(dup.ok).toBe(false);
  });

  it("records failed provider response without marking booking refunded", async () => {
    vi.doMock("@/lib/paystack/refundPaystackTransaction", () => ({
      refundPaystackTransaction: vi.fn(async () => ({
        ok: false,
        error: "Insufficient balance",
      })),
    }));
    vi.doMock("@/lib/referrals/clawback", () => ({
      maybeProcessReferralClawbackOnBookingChange: vi.fn(async () => undefined),
    }));
    vi.doMock("@/lib/logging/systemLog", () => ({
      logSystemEvent: vi.fn(async () => undefined),
    }));

    const { refundBookingPayment } = await import("@/lib/booking/refund/refundBookingPayment");
    const admin = makeAdminMock({
      id: "bk_4",
      status: "completed",
      payment_status: "success",
      paystack_reference: "psk_4",
      amount_paid_cents: 10_000,
      total_paid_cents: 10_000,
      total_paid_zar: 100,
      refunded_at: null,
      refund_status: null,
      monthly_invoice_id: null,
      customer_id: null,
      customer_email: null,
      booking_snapshot: {},
      currency: "ZAR",
    });

    const result = await refundBookingPayment(admin as never, {
      bookingId: "bk_4",
      note: "fail",
    });
    expect(result.ok).toBe(false);
    expect(admin.getRow().payment_status).toBe("success");
    expect(admin.getRow().refund_status).toBeNull();
    const snap = admin.getRow().booking_snapshot as {
      refund_workflow?: { records: Array<{ provider_state: string }> };
    };
    expect(snap.refund_workflow?.records[0]?.provider_state).toBe("failed");
  });

  it("retries after transient failure", async () => {
    const refundFn = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, error: "timeout" })
      .mockResolvedValueOnce({ ok: true, refundReference: "rf_retry" });
    vi.doMock("@/lib/paystack/refundPaystackTransaction", () => ({
      refundPaystackTransaction: refundFn,
    }));
    vi.doMock("@/lib/referrals/clawback", () => ({
      maybeProcessReferralClawbackOnBookingChange: vi.fn(async () => undefined),
    }));
    vi.doMock("@/lib/logging/systemLog", () => ({
      logSystemEvent: vi.fn(async () => undefined),
    }));

    const { refundBookingPayment } = await import("@/lib/booking/refund/refundBookingPayment");
    const admin = makeAdminMock({
      id: "bk_5",
      status: "completed",
      payment_status: "success",
      paystack_reference: "psk_5",
      amount_paid_cents: 12_000,
      total_paid_cents: 12_000,
      total_paid_zar: 120,
      refunded_at: null,
      refund_status: null,
      monthly_invoice_id: null,
      customer_id: null,
      customer_email: null,
      booking_snapshot: {},
      currency: "ZAR",
    });

    const fail = await refundBookingPayment(admin as never, { bookingId: "bk_5", note: "t" });
    expect(fail.ok).toBe(false);
    const snap = admin.getRow().booking_snapshot as {
      refund_workflow: { records: Array<{ id: string; provider_state: string }> };
    };
    const refundId = snap.refund_workflow.records[0]!.id;
    const ok = await refundBookingPayment(admin as never, {
      bookingId: "bk_5",
      note: "t",
      retryRefundId: refundId,
    });
    expect(ok.ok).toBe(true);
    expect(refundFn).toHaveBeenCalledTimes(2);
  });

  it("chargeback does not write illegal payment_status=refunded", async () => {
    vi.doMock("@/lib/paystack/refundPaystackTransaction", () => ({
      refundPaystackTransaction: vi.fn(),
    }));
    vi.doMock("@/lib/referrals/clawback", () => ({
      maybeProcessReferralClawbackOnBookingChange: vi.fn(async () => undefined),
    }));
    vi.doMock("@/lib/logging/systemLog", () => ({
      logSystemEvent: vi.fn(async () => undefined),
    }));

    const { markBookingChargeback } = await import("@/lib/booking/refund/refundBookingPayment");
    const admin = makeAdminMock({
      id: "bk_cb",
      status: "completed",
      payment_status: "success",
      refunded_at: null,
      refund_status: null,
    });

    const result = await markBookingChargeback(admin as never, {
      bookingId: "bk_cb",
      paystackReference: "psk_cb",
      note: "dispute",
    });
    expect(result.ok).toBe(true);
    expect(admin.getRow().refund_status).toBe("chargeback");
    expect(admin.getRow().payment_status).toBe("success");
    expect(admin.updates.some((u) => u.payment_status != null)).toBe(false);
  });

  it("never writes payment_status=refunded in refundBookingPayment source", () => {
    const src = readFileSync(
      resolve(__dirname, "../refundBookingPayment.ts"),
      "utf8",
    );
    expect(src).not.toMatch(/payment_status:\s*["']refunded["']/);
    const sm = readFileSync(resolve(__dirname, "../refundStateMachine.ts"), "utf8");
    expect(sm).not.toMatch(/return\s+["']refunded["']/);
  });
});
