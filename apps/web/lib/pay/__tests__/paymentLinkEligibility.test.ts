import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const { verify, issue } = vi.hoisted(() => ({ verify: vi.fn(), issue: vi.fn() }));
vi.mock("@/lib/payments/verifyPaystackTransaction", () => ({ fetchPaystackTransactionVerify: verify }));
vi.mock("@/lib/logging/systemLog", () => ({ logSystemEvent: vi.fn(), reportOperationalIssue: issue }));
import { checkPaymentLinkEligibility, claimAutomaticPaymentReminder, releaseAutomaticPaymentReminder } from "@/lib/pay/paymentLinkEligibility";

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
  it.each(["", "new_gateway_state"])("keeps unrecognized gateway status %s retryable without sending", async (status) => {
    verify.mockResolvedValue({ status: true, data: { status, reference } });
    expect(await checkPaymentLinkEligibility(makeAdmin(), "booking", reference))
      .toEqual({ allowed: false, reason: `gateway_${status || "unknown"}`, retryable: true });
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
  it("retires expired payment requests while keeping terminal expiry verification available", async () => {
    const expired = { ...unpaid, payment_link_expires_at: "2000-01-01T00:00:00Z" };
    expect(await checkPaymentLinkEligibility(makeAdmin([expired]), "booking", reference)).toEqual({ allowed: false, reason: "payment_link_expired" });
    expect(verify).not.toHaveBeenCalled();
    expect(await checkPaymentLinkEligibility(makeAdmin([expired]), "booking", reference, { allowExpired: true })).toEqual({ allowed: true });
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
  it("recovers a booking created before its gateway reference exists only when explicitly enabled", async () => {
    verify.mockResolvedValue({ status: false, message: "Transaction reference not found" });
    expect((await checkPaymentLinkEligibility(makeAdmin(), "booking", reference)).allowed).toBe(false);
    expect(await checkPaymentLinkEligibility(makeAdmin(), "booking", reference, { allowUninitialized: true })).toEqual({ allowed: true });
    expect((await checkPaymentLinkEligibility(makeAdmin([{ ...unpaid, payment_link: "https://checkout.paystack.com/existing" }]),
      "booking", reference, { allowUninitialized: true })).allowed).toBe(false);
  });
  it("recovers checkout without a reference only after checking booking-level payment evidence", async () => {
    const noReference = { ...unpaid, paystack_reference: null };
    expect(await checkPaymentLinkEligibility(makeAdmin([noReference]), "booking", "", { allowUninitialized: true })).toEqual({ allowed: true });
    expect(verify).not.toHaveBeenCalled();
    expect((await checkPaymentLinkEligibility(makeAdmin([noReference], { payment: { id: "tx" } }), "booking", "", { allowUninitialized: true })).allowed).toBe(false);
  });
  it("still fails closed on gateway outages and payment/initialization races during recovery", async () => {
    verify.mockResolvedValue({ status: false, message: "timeout" });
    expect((await checkPaymentLinkEligibility(makeAdmin(), "booking", reference, { allowUninitialized: true })).allowed).toBe(false);
    verify.mockResolvedValue({ status: false, message: "Transaction reference not found" });
    for (const update of [{ payment_status: "success" }, { payment_link: "https://checkout.paystack.com/new" }]) {
      expect((await checkPaymentLinkEligibility(makeAdmin([unpaid, { ...unpaid, ...update }]), "booking", reference, { allowUninitialized: true })).allowed).toBe(false);
    }
  });
});

describe("shared automatic reminder claims", () => {
  function legacyQuery(data: unknown = null, error: unknown = null) {
    const chain = { select: () => chain, eq: () => chain, maybeSingle: async () => ({ data, error }) };
    return chain;
  }
  it("allows only one of two concurrent workers for the same first reminder", async () => {
    const claims = new Set();
    const admin = { from: (table: string) => table === "bookings" ? legacyQuery({}) : table === "system_logs" ? legacyQuery() : ({ insert: async (row: { reference: string; event_type: string; channel: string }) => {
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
    const admin = { from: (table: string) => table === "bookings" ? legacyQuery({}) : table === "system_logs" ? legacyQuery() : ({ insert: async () => ({ error: { code: "08006", message: "offline" } }) }) } as never;
    expect(await claimAutomaticPaymentReminder(admin, "booking", reference, "first")).toBe(false);
  });
  it("honors legacy abandonment claims during rollout while keeping the final reminder separate", async () => {
    const insert = vi.fn(async () => ({ error: null }));
    const admin = { from: (table: string) => table === "bookings" ? legacyQuery({}) : table === "system_logs" ? legacyQuery({ id: "old-claim" }) : { insert } } as never;
    expect(await claimAutomaticPaymentReminder(admin, "booking", reference, "first")).toBe(false);
    expect(insert).not.toHaveBeenCalled();
    expect(await claimAutomaticPaymentReminder(admin, "booking", reference, "final")).toBe(true);
  });
  it("suppresses first reminders when legacy history cannot be checked", async () => {
    const insert = vi.fn();
    const admin = { from: (table: string) => table === "bookings" ? legacyQuery({}) : table === "system_logs" ? legacyQuery(null, { message: "offline" }) : { insert } } as never;
    expect(await claimAutomaticPaymentReminder(admin, "booking", reference, "first")).toBe(false);
    expect(insert).not.toHaveBeenCalled();
  });
  it.each(["first", "final"] as const)("honors pre-rollout adaptive %s reminder timestamps", async (stage) => {
    const insert = vi.fn();
    const admin = { from: (table: string) => table === "bookings" ? legacyQuery({ payment_link_reminder_1h_sent_at: "2026-10-16T12:00:00Z",
      payment_link_reminder_15m_sent_at: "2026-10-16T12:15:00Z" }) : { insert } } as never;
    expect(await claimAutomaticPaymentReminder(admin, "booking", reference, stage)).toBe(false);
    expect(insert).not.toHaveBeenCalled();
  });
  it("retries a transient failure when releasing an unsent reminder claim", async () => {
    const remove = vi.fn().mockResolvedValueOnce({ error: { message: "database unavailable" } }).mockResolvedValue({ error: null });
    const chain = { eq: () => chain, then: (resolve: (result: unknown) => unknown) => remove().then(resolve) };
    const admin = { from: () => ({ delete: () => chain }) } as never;
    await releaseAutomaticPaymentReminder(admin, reference, "first");
    expect(remove).toHaveBeenCalledTimes(2);
  });
  it("surfaces an exhausted claim-release failure for operational recovery", async () => {
    const remove = vi.fn(async () => ({ error: { message: "persistent database failure" } }));
    const chain = { eq: () => chain, then: (resolve: (result: unknown) => unknown) => remove().then(resolve) };
    await expect(releaseAutomaticPaymentReminder({ from: () => ({ delete: () => chain }) } as never, reference, "first")).rejects.toThrow("claim_release_failed");
    expect(remove).toHaveBeenCalledTimes(3);
    expect(issue).toHaveBeenCalledWith("critical", "paymentReminderClaim/release", "persistent database failure", expect.anything());
  });
});
