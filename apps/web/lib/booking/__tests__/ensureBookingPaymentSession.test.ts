import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  appendPaymentAttemptHistory,
  readPaymentAttemptHistory,
  referenceAllowedForBookingAccess,
} from "@/lib/booking/bookingPaymentAttemptHistory";
import {
  __resetEnsureBookingPaymentSessionInflightForTests,
  ensureBookingPaymentSession,
  trustedBookingPayableZar,
} from "@/lib/booking/ensureBookingPaymentSession";
import { detectPaystackKeyModeMismatch } from "@/lib/booking/paystackKeyModeConsistency";
import { PAYMENT_ERROR_CODES } from "@/lib/booking/paymentErrorCodes";

const BOOKING_ID = "11111111-1111-4111-8111-111111111111";

vi.mock("@/lib/payments/verifyPaystackTransaction", () => ({
  fetchPaystackTransactionVerify: vi.fn(async () => ({ status: false, message: "not found" })),
}));

vi.mock("@/lib/booking/runPaystackVerifyFinalizePipeline", () => ({
  runPaystackVerifyFinalizePipeline: vi.fn(async () => ({})),
}));

vi.mock("@/lib/email/appUrl", () => ({
  getPublicAppUrlBase: () => "https://shalean.co.za",
}));

type RowState = Record<string, unknown>;

function buildAdmin(initial: RowState) {
  const state = { row: { ...initial } as RowState };
  const admin = {
    from(table: string) {
      if (table !== "bookings") throw new Error(`unexpected table ${table}`);
      return {
        select() {
          return {
            eq() {
              return {
                async maybeSingle() {
                  return { data: { ...state.row }, error: null };
                },
              };
            },
          };
        },
        update(payload: Record<string, unknown>) {
          const filters: Array<() => boolean> = [];
          const chain = {
            eq(col: string, val: unknown) {
              filters.push(() => state.row[col] === val);
              return chain;
            },
            in(col: string, vals: unknown[]) {
              filters.push(() => vals.map(String).includes(String(state.row[col] ?? "")));
              return chain;
            },
            select() {
              return {
                async maybeSingle() {
                  if (!filters.every((fn) => fn())) {
                    return { data: null, error: null };
                  }
                  Object.assign(state.row, payload);
                  return { data: { ...state.row }, error: null };
                },
              };
            },
          };
          return chain;
        },
      };
    },
  } as unknown as SupabaseClient;
  return { admin, state };
}

describe("trustedBookingPayableZar", () => {
  it("prefers total_price then snapshot pay_total", () => {
    expect(trustedBookingPayableZar({ total_price: 450 })).toBe(450);
    expect(
      trustedBookingPayableZar({
        total_price: null,
        price_snapshot: { pay_total_zar: 320 },
      }),
    ).toBe(320);
  });
});

describe("payment attempt history", () => {
  it("keeps prior references for access after rotation", () => {
    const snap = appendPaymentAttemptHistory({}, {
      reference: "bv2_old",
      authorization_url: null,
      created_at: "2026-01-01T00:00:00.000Z",
      superseded_at: "2026-01-01T01:00:00.000Z",
      reason: "PAYMENT_LINK_MISSING",
    });
    expect(readPaymentAttemptHistory(snap)).toHaveLength(1);
    expect(referenceAllowedForBookingAccess("bps_new", "bv2_old", snap)).toBe(true);
    expect(referenceAllowedForBookingAccess("bps_new", "bps_new", snap)).toBe(true);
    expect(referenceAllowedForBookingAccess("bps_new", "other", snap)).toBe(false);
  });
});

describe("detectPaystackKeyModeMismatch", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("detects live secret with test public key", () => {
    vi.stubEnv("PAYSTACK_SECRET_KEY", "sk_live_abc");
    vi.stubEnv("NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY", "pk_test_xyz");
    const m = detectPaystackKeyModeMismatch();
    expect(m?.errorCode).toBe(PAYMENT_ERROR_CODES.PAYMENT_CONFIGURATION_ERROR);
  });

  it("allows matching live keys", () => {
    vi.stubEnv("PAYSTACK_SECRET_KEY", "sk_live_abc");
    vi.stubEnv("NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY", "pk_live_xyz");
    expect(detectPaystackKeyModeMismatch()).toBeNull();
  });
});

describe("ensureBookingPaymentSession", () => {
  beforeEach(async () => {
    __resetEnsureBookingPaymentSessionInflightForTests();
    vi.stubEnv("PAYSTACK_SECRET_KEY", "sk_test_secret");
    vi.stubEnv("NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY", "pk_test_public");
    const { fetchPaystackTransactionVerify } = await import("@/lib/payments/verifyPaystackTransaction");
    vi.mocked(fetchPaystackTransactionVerify).mockReset();
    vi.mocked(fetchPaystackTransactionVerify).mockResolvedValue({ status: false, message: "not found" });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        json: async () => ({
          status: true,
          data: {
            authorization_url: "https://checkout.paystack.com/fresh",
            reference: "ignored",
          },
        }),
      })),
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    __resetEnsureBookingPaymentSessionInflightForTests();
  });

  it("returns paid without initializing when booking already paid", async () => {
    const { admin } = buildAdmin({
      id: BOOKING_ID,
      status: "pending",
      payment_status: "success",
      payment_completed_at: "2026-07-01T00:00:00.000Z",
      paystack_reference: "paid_ref",
      payment_link: null,
      payment_link_expires_at: null,
      customer_email: "a@b.co.za",
      customer_id: "22222222-2222-4222-8222-222222222222",
      user_id: "22222222-2222-4222-8222-222222222222",
      total_price: 400,
      total_paid_zar: 400,
      price_snapshot: null,
      booking_snapshot: {},
      service: "Standard",
      date: "2026-07-20",
      time: "10:00",
    });

    const result = await ensureBookingPaymentSession(admin, {
      bookingId: BOOKING_ID,
      access: { kind: "owner", userId: "22222222-2222-4222-8222-222222222222" },
    });
    expect(result.status).toBe("paid");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("reuses a usable stored payment link", async () => {
    const expires = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const { admin } = buildAdmin({
      id: BOOKING_ID,
      status: "pending_payment",
      payment_status: null,
      payment_completed_at: null,
      paystack_reference: "ref_ok",
      payment_link: "https://checkout.paystack.com/ok",
      payment_link_expires_at: expires,
      customer_email: "a@b.co.za",
      customer_id: "22222222-2222-4222-8222-222222222222",
      user_id: "22222222-2222-4222-8222-222222222222",
      total_price: 400,
      total_paid_zar: 400,
      price_snapshot: null,
      booking_snapshot: {},
      service: "Standard",
      date: "2026-07-20",
      time: "10:00",
    });

    const result = await ensureBookingPaymentSession(admin, {
      bookingId: BOOKING_ID,
      access: { kind: "paystack_ref", reference: "ref_ok" },
    });
    expect(result.status).toBe("ready");
    if (result.status === "ready") {
      expect(result.reused).toBe(true);
      expect(result.authorizationUrl).toBe("https://checkout.paystack.com/ok");
    }
    expect(fetch).not.toHaveBeenCalled();
  });

  it("creates a fresh checkout when payment_link is missing", async () => {
    const { admin, state } = buildAdmin({
      id: BOOKING_ID,
      status: "pending_payment",
      payment_status: null,
      payment_completed_at: null,
      paystack_reference: "bv2_old",
      payment_link: null,
      payment_link_expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      customer_email: "a@b.co.za",
      customer_id: "22222222-2222-4222-8222-222222222222",
      user_id: "22222222-2222-4222-8222-222222222222",
      total_price: 400,
      total_paid_zar: 400,
      price_snapshot: null,
      booking_snapshot: { v: 1 },
      service: "Standard",
      date: "2026-07-20",
      time: "10:00",
    });

    const result = await ensureBookingPaymentSession(admin, {
      bookingId: BOOKING_ID,
      access: { kind: "paystack_ref", reference: "bv2_old" },
    });

    expect(result.status).toBe("ready");
    if (result.status === "ready") {
      expect(result.refreshed).toBe(true);
      expect(result.authorizationUrl).toBe("https://checkout.paystack.com/fresh");
      expect(result.message).toMatch(/expired|new secure payment session/i);
    }
    expect(fetch).toHaveBeenCalledTimes(1);
    const hist = readPaymentAttemptHistory(state.row.booking_snapshot);
    expect(hist.some((h) => h.reference === "bv2_old")).toBe(true);
  });

  it("treats missing authorization_url as initialization failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        json: async () => ({ status: true, data: { reference: "x" } }),
      })),
    );
    const { admin } = buildAdmin({
      id: BOOKING_ID,
      status: "pending_payment",
      payment_status: null,
      payment_completed_at: null,
      paystack_reference: "bv2_old",
      payment_link: null,
      payment_link_expires_at: null,
      customer_email: "a@b.co.za",
      customer_id: "22222222-2222-4222-8222-222222222222",
      user_id: "22222222-2222-4222-8222-222222222222",
      total_price: 400,
      total_paid_zar: null,
      price_snapshot: null,
      booking_snapshot: {},
      service: "Standard",
      date: null,
      time: null,
    });

    const result = await ensureBookingPaymentSession(admin, {
      bookingId: BOOKING_ID,
      access: { kind: "owner", userId: "22222222-2222-4222-8222-222222222222" },
    });
    expect(result.status).toBe("failed");
    if (result.status === "failed") {
      expect(result.errorCode).toBe(PAYMENT_ERROR_CODES.PAYMENT_INITIALIZATION_FAILED);
      expect(result.retryable).toBe(true);
    }
  });

  it("denies access for another customer", async () => {
    const { admin } = buildAdmin({
      id: BOOKING_ID,
      status: "pending_payment",
      payment_status: null,
      payment_completed_at: null,
      paystack_reference: "ref_ok",
      payment_link: "https://checkout.paystack.com/ok",
      payment_link_expires_at: new Date(Date.now() + 60_000).toISOString(),
      customer_email: "a@b.co.za",
      customer_id: "22222222-2222-4222-8222-222222222222",
      user_id: "22222222-2222-4222-8222-222222222222",
      total_price: 400,
      total_paid_zar: 400,
      price_snapshot: null,
      booking_snapshot: {},
      service: "Standard",
      date: null,
      time: null,
    });

    const result = await ensureBookingPaymentSession(admin, {
      bookingId: BOOKING_ID,
      access: { kind: "owner", userId: "33333333-3333-4333-8333-333333333333" },
    });
    expect(result.status).toBe("failed");
    if (result.status === "failed") {
      expect(result.errorCode).toBe(PAYMENT_ERROR_CODES.PAYMENT_ACCESS_DENIED);
    }
  });

  it("dedupes concurrent ensure calls into one Paystack initialize", async () => {
    let fetchCount = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        fetchCount += 1;
        await new Promise((r) => setTimeout(r, 30));
        return {
          json: async () => ({
            status: true,
            data: {
              authorization_url: "https://checkout.paystack.com/fresh",
              reference: "bps_concurrent",
            },
          }),
        };
      }),
    );

    const { admin } = buildAdmin({
      id: BOOKING_ID,
      status: "pending_payment",
      payment_status: null,
      payment_completed_at: null,
      paystack_reference: "bv2_old",
      payment_link: null,
      payment_link_expires_at: null,
      customer_email: "a@b.co.za",
      customer_id: "22222222-2222-4222-8222-222222222222",
      user_id: "22222222-2222-4222-8222-222222222222",
      total_price: 400,
      total_paid_zar: 400,
      price_snapshot: null,
      booking_snapshot: {},
      service: "Standard",
      date: null,
      time: null,
    });

    const access = {
      kind: "owner" as const,
      userId: "22222222-2222-4222-8222-222222222222",
    };
    const [a, b] = await Promise.all([
      ensureBookingPaymentSession(admin, { bookingId: BOOKING_ID, access }),
      ensureBookingPaymentSession(admin, { bookingId: BOOKING_ID, access }),
    ]);

    expect(a.status).toBe("ready");
    expect(b.status).toBe("ready");
    expect(a).toBe(b);
    expect(fetchCount).toBe(1);
  });

  it("finalizes when Paystack already reports success for the stored reference", async () => {
    const { fetchPaystackTransactionVerify } = await import("@/lib/payments/verifyPaystackTransaction");
    vi.mocked(fetchPaystackTransactionVerify).mockResolvedValueOnce({
      status: true,
      data: { status: "success", reference: "bv2_paid", amount: 40000, currency: "ZAR" },
    });

    const { admin } = buildAdmin({
      id: BOOKING_ID,
      status: "pending_payment",
      payment_status: null,
      payment_completed_at: null,
      paystack_reference: "bv2_paid",
      payment_link: null,
      payment_link_expires_at: null,
      customer_email: "a@b.co.za",
      customer_id: "22222222-2222-4222-8222-222222222222",
      user_id: "22222222-2222-4222-8222-222222222222",
      total_price: 400,
      total_paid_zar: 400,
      price_snapshot: null,
      booking_snapshot: {},
      service: "Standard",
      date: null,
      time: null,
    });

    const result = await ensureBookingPaymentSession(admin, {
      bookingId: BOOKING_ID,
      access: { kind: "owner", userId: "22222222-2222-4222-8222-222222222222" },
    });
    expect(result.status).toBe("paid");
  });
});
