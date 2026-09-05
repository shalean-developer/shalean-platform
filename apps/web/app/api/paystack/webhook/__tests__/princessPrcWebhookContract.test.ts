/**
 * Princess PR C — deterministic Paystack webhook contract tests (synthetic fixtures).
 * Signature verification, idempotency, mismatch rejection, and safe logging.
 */
import crypto from "crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const SECRET = "sk_test_princess_prc_webhook_contract_secret";

const mocks = vi.hoisted(() => ({
  finalizePaidBooking: vi.fn(),
  findBookingIdStatusForPaystackReference: vi.fn(),
  bookingIdForPaystackReference: vi.fn(),
  replayPaymentConfirmedNotifyForPersistedBooking: vi.fn(),
  syncPaidBookingSideEffects: vi.fn(),
  recordPaystackBookingPayment: vi.fn(),
  recordPaystackMonthlyInvoicePayment: vi.fn(),
  recordPaystackSalesDocumentPayment: vi.fn(),
  routePaystackChargeForMonthlyInvoice: vi.fn(),
  routePaystackChargeForSalesDocument: vi.fn(),
  enqueuePaystackRecoveryFailedJobs: vi.fn(),
  logSystemEvent: vi.fn(),
  reportOperationalIssue: vi.fn(),
  logPaymentStructured: vi.fn(),
  postDispatchControlAlert: vi.fn(),
  getSupabaseAdmin: vi.fn(),
}));

vi.mock("@/lib/booking/bookingOperations", () => ({
  finalizePaidBooking: mocks.finalizePaidBooking,
  upsertResultFromFinalizePaidBookingOp: (op: {
    ok: boolean;
    data?: {
      ok: boolean;
      skipped: boolean;
      bookingId: string | null;
      error?: string;
      reason?: string;
    };
    bookingId?: string;
    message?: string;
    cause?: unknown;
  }) => {
    if (op.ok && op.data) return op.data;
    if (!op.ok && op.cause && typeof op.cause === "object" && "ok" in (op.cause as object)) {
      return op.cause;
    }
    if (!op.ok) {
      return {
        ok: false,
        skipped: true,
        bookingId: op.bookingId ?? null,
        error: op.message,
      };
    }
    return { ok: false, skipped: true, bookingId: null, error: "Finalize returned no data." };
  },
}));

vi.mock("@/lib/booking/paystackBookingIdLookup", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/booking/paystackBookingIdLookup")>();
  return {
    ...actual,
    findBookingIdStatusForPaystackReference: mocks.findBookingIdStatusForPaystackReference,
    bookingIdForPaystackReference: mocks.bookingIdForPaystackReference,
  };
});

vi.mock("@/lib/booking/paystackReplayPaymentConfirmedNotify", () => ({
  replayPaymentConfirmedNotifyForPersistedBooking: mocks.replayPaymentConfirmedNotifyForPersistedBooking,
}));

vi.mock("@/lib/booking/syncPaidBookingSideEffects", () => ({
  syncPaidBookingSideEffects: mocks.syncPaidBookingSideEffects,
}));

vi.mock("@/lib/payments/recordPaystackSettlement", () => ({
  paystackChargeDataFromRecord: (d: Record<string, unknown>) => d,
  recordPaystackBookingPayment: mocks.recordPaystackBookingPayment,
  recordPaystackMonthlyInvoicePayment: mocks.recordPaystackMonthlyInvoicePayment,
  recordPaystackSalesDocumentPayment: mocks.recordPaystackSalesDocumentPayment,
}));

vi.mock("@/lib/booking/routePaystackChargeForMonthlyInvoice", () => ({
  routePaystackChargeForMonthlyInvoice: mocks.routePaystackChargeForMonthlyInvoice,
}));

vi.mock("@/lib/salesDocument/routePaystackChargeForSalesDocument", () => ({
  routePaystackChargeForSalesDocument: mocks.routePaystackChargeForSalesDocument,
}));

vi.mock("@/lib/booking/enqueuePaystackRecoveryFailedJobs", () => ({
  enqueuePaystackRecoveryFailedJobs: mocks.enqueuePaystackRecoveryFailedJobs,
}));

vi.mock("@/lib/logging/systemLog", () => ({
  logSystemEvent: mocks.logSystemEvent,
  reportOperationalIssue: mocks.reportOperationalIssue,
}));

vi.mock("@/lib/observability/paymentStructuredLog", () => ({
  logPaymentStructured: mocks.logPaymentStructured,
}));

vi.mock("@/lib/ops/dispatchControlWebhook", () => ({
  postDispatchControlAlert: mocks.postDispatchControlAlert,
}));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: mocks.getSupabaseAdmin,
}));

vi.mock("@/lib/metrics/counters", () => ({
  metrics: { increment: vi.fn() },
}));

vi.mock("@/lib/metrics/pricingMismatch", () => ({
  expectedCheckoutZarFromVerify: () => null,
  pricingVersionIdFromLocked: () => null,
  recordPaystackPricingMismatch: vi.fn(),
}));

const BOOKING_ID = "11111111-1111-4111-8111-111111111111";
const REFERENCE = `pay_${BOOKING_ID}`;
const AMOUNT_CENTS = 45_000;

function minimalPriceSnapshot() {
  return {
    version: 1,
    currency: "ZAR",
    total_zar: 450,
    subtotal_zar: 450,
    extras_total_zar: 0,
    discount_zar: 0,
    tip_zar: 0,
    visit_total_zar: 450,
    duration_hours: 3,
    cleaners_count: 1,
    line_items: [{ id: "visit", name: "Visit", amount_zar: 450 }],
    pricing_version_id: null,
  };
}

function chargeSuccessPayload(overrides: {
  reference?: string;
  amount?: number;
  currency?: string;
  eventId?: number;
  metadata?: Record<string, unknown>;
  event?: string;
} = {}) {
  const reference = overrides.reference ?? REFERENCE;
  const metadata = {
    booking_id: BOOKING_ID,
    shalean_booking_id: BOOKING_ID,
    customer_email: "prc-uat@example.com",
    price_snapshot: JSON.stringify(minimalPriceSnapshot()),
    ...(overrides.metadata ?? {}),
  };
  return {
    event: overrides.event ?? "charge.success",
    data: {
      id: overrides.eventId ?? 900001,
      reference,
      amount: overrides.amount ?? AMOUNT_CENTS,
      currency: overrides.currency ?? "ZAR",
      status: "success",
      paid_at: "2026-07-16T00:00:00.000Z",
      customer: { email: "prc-uat@example.com", customer_code: "CUS_test" },
      authorization: { authorization_code: "AUTH_secret_should_not_log" },
      metadata,
    },
  };
}

function sign(rawBody: string, secret = SECRET): string {
  return crypto.createHmac("sha512", secret).update(rawBody).digest("hex");
}

async function postWebhook(payload: unknown, signature: string | null) {
  const rawBody = typeof payload === "string" ? payload : JSON.stringify(payload);
  const headers = new Headers({ "Content-Type": "application/json" });
  if (signature != null) headers.set("x-paystack-signature", signature);
  const { POST } = await import("@/app/api/paystack/webhook/route");
  return POST(
    new Request("http://localhost/api/paystack/webhook", {
      method: "POST",
      headers,
      body: rawBody,
    }),
  );
}

describe("Princess PR C — Paystack webhook contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.PAYSTACK_SECRET_KEY = SECRET;
    const replayQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [], error: null }),
      maybeSingle: vi.fn().mockResolvedValue({ data: {
        id: BOOKING_ID, status: "pending", paystack_reference: REFERENCE,
        customer_email: "prc-uat@example.com", customer_id: null,
      }, error: null }),
    };
    mocks.getSupabaseAdmin.mockReturnValue({
      from: vi.fn().mockReturnValue(replayQuery),
      rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
    });
    mocks.routePaystackChargeForMonthlyInvoice.mockResolvedValue({ kind: "not_monthly" });
    mocks.routePaystackChargeForSalesDocument.mockResolvedValue({ kind: "not_sales_doc" });
    mocks.findBookingIdStatusForPaystackReference.mockResolvedValue(null);
    mocks.bookingIdForPaystackReference.mockResolvedValue(BOOKING_ID);
    mocks.finalizePaidBooking.mockResolvedValue({
      ok: true,
      bookingId: BOOKING_ID,
      data: {
        ok: true,
        skipped: false,
        bookingId: BOOKING_ID,
        bookingInDatabase: true,
      },
    });
    mocks.enqueuePaystackRecoveryFailedJobs.mockResolvedValue(undefined);
    mocks.recordPaystackBookingPayment.mockResolvedValue(undefined);
    mocks.syncPaidBookingSideEffects.mockResolvedValue(undefined);
    mocks.replayPaymentConfirmedNotifyForPersistedBooking.mockResolvedValue(undefined);
    mocks.logSystemEvent.mockResolvedValue(undefined);
    mocks.reportOperationalIssue.mockResolvedValue(undefined);
    mocks.postDispatchControlAlert.mockResolvedValue(undefined);
  });

  it("1. accepts a valid signature and settles via finalizePaidBooking", async () => {
    const payload = chargeSuccessPayload();
    const raw = JSON.stringify(payload);
    const res = await postWebhook(raw, sign(raw));
    expect(res.status).toBe(200);
    expect(mocks.finalizePaidBooking).toHaveBeenCalledTimes(1);
    expect(mocks.finalizePaidBooking).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "webhook",
        paystackReference: REFERENCE,
        amountCents: AMOUNT_CENTS,
        currency: "ZAR",
      }),
    );
  });

  it("2. rejects an invalid signature with 401", async () => {
    const payload = chargeSuccessPayload();
    const res = await postWebhook(payload, "deadbeef_invalid");
    expect(res.status).toBe(401);
    expect(mocks.finalizePaidBooking).not.toHaveBeenCalled();
    expect(mocks.logPaymentStructured).toHaveBeenCalledWith(
      "payment_webhook_outcome",
      expect.objectContaining({ rejection_reason: "invalid_signature" }),
    );
  });

  it("3. rejects a missing signature with 401", async () => {
    const payload = chargeSuccessPayload();
    const res = await postWebhook(payload, null);
    expect(res.status).toBe(401);
    expect(mocks.finalizePaidBooking).not.toHaveBeenCalled();
    expect(mocks.logPaymentStructured).toHaveBeenCalledWith(
      "payment_webhook_outcome",
      expect.objectContaining({ rejection_reason: "missing_signature" }),
    );
  });

  it("4. unknown event types cause no finalize", async () => {
    const payload = chargeSuccessPayload({ event: "subscription.create" });
    const raw = JSON.stringify(payload);
    const res = await postWebhook(raw, sign(raw));
    expect(res.status).toBe(200);
    expect(mocks.finalizePaidBooking).not.toHaveBeenCalled();
    expect(mocks.logPaymentStructured).toHaveBeenCalledWith(
      "payment_webhook_outcome",
      expect.objectContaining({ outcome: "acknowledged_no_settle" }),
    );
  });

  it("5. valid charge.success settles the intended booking", async () => {
    const payload = chargeSuccessPayload();
    const raw = JSON.stringify(payload);
    await postWebhook(raw, sign(raw));
    expect(mocks.finalizePaidBooking).toHaveBeenCalledWith(
      expect.objectContaining({ paystackReference: REFERENCE }),
    );
    expect(mocks.recordPaystackBookingPayment).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ bookingId: BOOKING_ID, reference: REFERENCE }),
    );
  });

  it("6. duplicate delivery is idempotent (already persisted)", async () => {
    mocks.findBookingIdStatusForPaystackReference.mockResolvedValue({
      bookingId: BOOKING_ID,
      status: "pending",
    });
    const payload = chargeSuccessPayload();
    const raw = JSON.stringify(payload);
    const res = await postWebhook(raw, sign(raw));
    expect(res.status).toBe(200);
    expect(mocks.finalizePaidBooking).not.toHaveBeenCalled();
    expect(mocks.replayPaymentConfirmedNotifyForPersistedBooking).toHaveBeenCalled();
    expect(mocks.logPaymentStructured).toHaveBeenCalledWith(
      "payment_webhook_outcome",
      expect.objectContaining({ outcome: "idempotent_skip", idempotency_result: "already_persisted" }),
    );
  });

  it("7. different gateway event IDs for the same reference do not double-settle", async () => {
    mocks.findBookingIdStatusForPaystackReference.mockResolvedValue({
      bookingId: BOOKING_ID,
      status: "assigned",
    });
    const first = chargeSuccessPayload({ eventId: 1001 });
    const second = chargeSuccessPayload({ eventId: 1002 });
    const raw1 = JSON.stringify(first);
    const raw2 = JSON.stringify(second);
    await postWebhook(raw1, sign(raw1));
    await postWebhook(raw2, sign(raw2));
    expect(mocks.finalizePaidBooking).not.toHaveBeenCalled();
    expect(mocks.recordPaystackBookingPayment).toHaveBeenCalledTimes(2);
  });

  it("8. amount mismatch is rejected by finalize (no settle success path)", async () => {
    mocks.finalizePaidBooking.mockResolvedValue({
      ok: false,
      bookingId: BOOKING_ID,
      code: "payment_amount_mismatch",
      message: "amount_mismatch",
      cause: {
        ok: false,
        skipped: true,
        bookingId: BOOKING_ID,
        error: "amount_mismatch",
        reason: "amount_mismatch",
        bookingInDatabase: true,
        recoveryEnqueue: true,
      },
    });
    const payload = chargeSuccessPayload({ amount: 1 });
    const raw = JSON.stringify(payload);
    const res = await postWebhook(raw, sign(raw));
    expect(res.status).toBe(200);
    expect(mocks.enqueuePaystackRecoveryFailedJobs).toHaveBeenCalled();
    expect(mocks.logPaymentStructured).toHaveBeenCalledWith(
      "payment_webhook_outcome",
      expect.objectContaining({ outcome: "rejected", rejection_reason: "amount_mismatch" }),
    );
  });

  it("9. currency mismatch is logged and finalized for quarantine", async () => {
    mocks.finalizePaidBooking.mockResolvedValue({
      ok: false,
      bookingId: BOOKING_ID,
      code: "payment_currency_mismatch",
      message: "currency_mismatch",
      cause: {
        ok: false,
        skipped: true,
        bookingId: BOOKING_ID,
        error: "currency_mismatch",
        reason: "currency_mismatch",
        bookingInDatabase: true,
        recoveryEnqueue: true,
      },
    });
    const payload = chargeSuccessPayload({ currency: "USD" });
    const raw = JSON.stringify(payload);
    const res = await postWebhook(raw, sign(raw));
    expect(res.status).toBe(200);
    expect(mocks.finalizePaidBooking).toHaveBeenCalledWith(
      expect.objectContaining({ currency: "USD" }),
    );
    expect(mocks.reportOperationalIssue).toHaveBeenCalledWith(
      "critical",
      "paystack/webhook",
      "charge.success currency_mismatch",
      expect.objectContaining({ currency: "USD" }),
    );
  });

  it("10. booking reference mismatch surfaces as rejected finalize", async () => {
    mocks.finalizePaidBooking.mockResolvedValue({
      ok: false,
      bookingId: BOOKING_ID,
      code: "payment_booking_mismatch",
      message: "booking_mismatch",
      cause: {
        ok: false,
        skipped: true,
        bookingId: BOOKING_ID,
        error: "booking_mismatch",
        reason: "booking_mismatch",
        bookingInDatabase: true,
      },
    });
    const payload = chargeSuccessPayload({
      metadata: { booking_id: "22222222-2222-4222-8222-222222222222" },
    });
    const raw = JSON.stringify(payload);
    const res = await postWebhook(raw, sign(raw));
    expect(res.status).toBe(200);
    expect(mocks.logPaymentStructured).toHaveBeenCalledWith(
      "payment_webhook_outcome",
      expect.objectContaining({ rejection_reason: "booking_mismatch" }),
    );
  });

  it("11. missing booking is handled safely (no throw; recovery enqueue)", async () => {
    mocks.finalizePaidBooking.mockResolvedValue({
      ok: false,
      code: "payment_finalize_failed",
      message: "no pending row",
      cause: {
        ok: false,
        skipped: true,
        bookingId: null,
        error: "no pending row",
      },
    });
    const payload = chargeSuccessPayload();
    const raw = JSON.stringify(payload);
    const res = await postWebhook(raw, sign(raw));
    expect(res.status).toBe(200);
    expect(mocks.enqueuePaystackRecoveryFailedJobs).toHaveBeenCalled();
  });

  it("12. already-paid booking is not finalized again", async () => {
    mocks.findBookingIdStatusForPaystackReference.mockResolvedValue({
      bookingId: BOOKING_ID,
      status: "completed",
    });
    const payload = chargeSuccessPayload();
    const raw = JSON.stringify(payload);
    await postWebhook(raw, sign(raw));
    expect(mocks.finalizePaidBooking).not.toHaveBeenCalled();
  });

  it("13. webhook retry after temporary finalize failure remains safe on success", async () => {
    mocks.finalizePaidBooking
      .mockResolvedValueOnce({
        ok: false,
        code: "finalize_threw",
        message: "db timeout",
        cause: new Error("db timeout"),
      })
      .mockResolvedValueOnce({
        ok: true,
        bookingId: BOOKING_ID,
        data: {
          ok: true,
          skipped: false,
          bookingId: BOOKING_ID,
          bookingInDatabase: true,
        },
      });
    const payload = chargeSuccessPayload();
    const raw = JSON.stringify(payload);
    const first = await postWebhook(raw, sign(raw));
    expect(first.status).toBe(200);
    const second = await postWebhook(raw, sign(raw));
    expect(second.status).toBe(200);
    expect(mocks.finalizePaidBooking).toHaveBeenCalledTimes(2);
  });

  it("14. structured outcomes never include authorization codes or raw secrets", async () => {
    const payload = chargeSuccessPayload();
    const raw = JSON.stringify(payload);
    await postWebhook(raw, sign(raw));
    const structuredCalls = mocks.logPaymentStructured.mock.calls;
    const serialized = JSON.stringify(structuredCalls);
    expect(serialized).not.toContain("AUTH_secret_should_not_log");
    expect(serialized).not.toContain(SECRET);
    expect(serialized).not.toMatch(/sk_test_/);
    const outcome = structuredCalls.find((c) => c[0] === "payment_webhook_outcome");
    expect(outcome?.[1]).toEqual(
      expect.objectContaining({
        reference_masked: expect.stringMatching(/…$/),
      }),
    );
    expect(String(outcome?.[1]?.reference_masked ?? "")).not.toBe(REFERENCE);
  });
});
