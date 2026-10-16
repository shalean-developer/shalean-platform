import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const { verify, issue } = vi.hoisted(() => ({ verify: vi.fn(), issue: vi.fn() }));
vi.mock("@/lib/payments/verifyPaystackTransaction", () => ({ fetchPaystackTransactionVerify: verify }));
vi.mock("@/lib/logging/systemLog", () => ({ logSystemEvent: vi.fn(), reportOperationalIssue: issue }));
import { checkPaymentLinkEligibility, claimAutomaticPaymentReminder } from "@/lib/pay/paymentLinkEligibility";

const reference = "bps_test_payment";
const unpaid = { status: "pending_payment", payment_status: "pending", paystack_reference: reference };

function makeAdmin(rows: Record<string, unknown>[] = [unpaid], options?: { payment?: unknown; error?: unknown }) {
  let reads = 0;
  return { from: (table: string) => {
    const chain = { select: vi.fn(() => chain), eq: vi.fn(() => chain),
      maybeSingle: vi.fn(async () => table === "bookings"
        ? { data: rows[Math.min(reads++, rows.length - 1)], error: options?.error ?? null }
        : { data: options?.payment ?? null, error: null }) };
    return chain;
  } } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("PAYSTACK_SECRET_KEY", "sk_test_mock");
  verify.mockResolvedValue({ status: true, data: { status: "abandoned", reference } });
});
afterEach(() => vi.unstubAllEnvs());

describe("payment requests require current unpaid evidence", () => {
  it.each(["abandoned", "failed"])("allows a confirmed %s transaction", async (status) => {
    verify.mockResolvedValue({ status: true, data: { status, reference } });
    expect(await checkPaymentLinkEligibility(makeAdmin(), "booking", reference)).toEqual({ allowed: true });
  });
  it.each(["success", "pending", "processing", "ongoing", "queued", "reversed", "unknown"])(
    "never requests payment for gateway status %s", async (status) => {
      verify.mockResolvedValue({ status: true, data: { status, reference } });
      expect((await checkPaymentLinkEligibility(makeAdmin(), "booking", reference)).allowed).toBe(false);
    });
  it.each([
    { payment_status: "success" }, { payment_status: "paid" }, { payment_status: "pending_monthly" },
    { payment_completed_at: "2026-10-16T12:00:00Z" }, { paid_at: "2026-10-16T12:00:00Z" },
    { payment_transaction_id: "transaction" }, { status: "cancelled" }, { is_monthly_billing_booking: true },
    { paystack_reference: "bps_replaced" },
  ])("blocks persisted settlement/lifecycle evidence %j", async (fields) => {
    expect((await checkPaymentLinkEligibility(makeAdmin([{ ...unpaid, ...fields }]), "booking", reference)).allowed).toBe(false);
    expect(verify).not.toHaveBeenCalled();
  });
  it("blocks a captured payment even when its booking link was not persisted", async () => {
    expect(await checkPaymentLinkEligibility(makeAdmin([unpaid], { payment: { id: "tx" } }), "booking", reference))
      .toEqual({ allowed: false, reason: "payment_recorded" });
    expect(verify).not.toHaveBeenCalled();
  });
  it("fails closed on query failure, unavailable gateway, or a different reference", async () => {
    expect((await checkPaymentLinkEligibility(makeAdmin([unpaid], { error: { message: "offline" } }), "booking", reference)).allowed).toBe(false);
    verify.mockResolvedValue({ status: false, message: "timeout" });
    expect((await checkPaymentLinkEligibility(makeAdmin(), "booking", reference)).allowed).toBe(false);
    verify.mockResolvedValue({ status: true, data: { status: "failed", reference: "other" } });
    expect((await checkPaymentLinkEligibility(makeAdmin(), "booking", reference)).allowed).toBe(false);
  });
  it("rechecks settlement and reference after the gateway request", async () => {
    const latest = { ...unpaid, payment_status: "success" };
    expect(await checkPaymentLinkEligibility(makeAdmin([unpaid, latest]), "booking", reference))
      .toEqual({ allowed: false, reason: "booking_changed" });
  });
});

describe("shared automatic reminder claims", () => {
  it("allows only one of two concurrent workers for the same first reminder", async () => {
    const claims = new Set();
    const admin = { from: () => ({ insert: async (row: { reference: string; event_type: string; channel: string }) => {
      const key = `${row.reference}:${row.event_type}:${row.channel}`;
      if (claims.has(key)) return { error: { code: "23505" } };
      claims.add(key); return { error: null };
    } }) } as never;
    const results = await Promise.all([
      claimAutomaticPaymentReminder(admin, "booking", reference, "first"),
      claimAutomaticPaymentReminder(admin, "booking", reference, "first"),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await claimAutomaticPaymentReminder(admin, "booking", reference, "final")).toBe(true);
  });
  it("does not send when the database cannot establish ownership", async () => {
    const admin = { from: () => ({ insert: async () => ({ error: { code: "08006", message: "offline" } }) }) } as never;
    expect(await claimAutomaticPaymentReminder(admin, "booking", reference, "first")).toBe(false);
  });
});
