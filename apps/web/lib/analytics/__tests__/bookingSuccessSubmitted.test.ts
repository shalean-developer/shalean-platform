import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  canEmitCoveredBookingSubmitted,
  emitBookingSubmittedAfterPaystackVerify,
  finalizeCoveredBookingSubmitted,
  resolveBookingSuccessPath,
} from "@/lib/analytics/bookingSuccessSubmitted";
import { GA4_FUNNEL_EVENTS } from "@/lib/analytics/ga4Events";

const BOOKING_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const BOOKING_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function stubGa4Window(store?: Map<string, string>) {
  const map = store ?? new Map<string, string>();
  const gtag = vi.fn();
  vi.stubGlobal("window", {
    location: { pathname: "/account/success" },
    dataLayer: [] as unknown[],
    gtag,
    localStorage: {
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => {
        map.set(k, v);
      },
      removeItem: (k: string) => {
        map.delete(k);
      },
      clear: () => map.clear(),
      key: () => null,
      length: 0,
    },
    sessionStorage: {
      getItem: () => null,
      setItem: () => undefined,
      removeItem: () => undefined,
      clear: () => undefined,
      key: () => null,
      length: 0,
    },
  });
  return { gtag, store: map };
}

describe("resolveBookingSuccessPath", () => {
  it("routes area-review first", () => {
    expect(
      resolveBookingSuccessPath({
        areaReview: "1",
        bookingId: BOOKING_A,
        reference: "bv2_x",
      }),
    ).toBe("area_review");
  });

  it("routes covered bookings by bookingId + covered flag", () => {
    expect(
      resolveBookingSuccessPath({
        covered: "1",
        bookingId: BOOKING_A,
      }),
    ).toBe("covered");
  });

  it("routes Paystack by reference", () => {
    expect(resolveBookingSuccessPath({ reference: "psk_ref_1" })).toBe("paystack");
  });

  it("does not treat failed confirm (no ids) as a success path", () => {
    expect(resolveBookingSuccessPath({})).toBe("missing");
  });
});

describe("booking_submitted success paths", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("Paystack persisted booking emits exactly one booking_submitted", () => {
    const { gtag, store } = stubGa4Window();
    const first = emitBookingSubmittedAfterPaystackVerify({
      bookingPersisted: true,
      bookingId: BOOKING_A,
      reference: "psk_1",
      service: "regular-cleaning",
      value: 450,
    });
    const second = emitBookingSubmittedAfterPaystackVerify({
      bookingPersisted: true,
      bookingId: BOOKING_A,
      reference: "psk_1",
      service: "regular-cleaning",
      value: 450,
    });
    expect(first).toBe(true);
    expect(second).toBe(false);
    const events = gtag.mock.calls.filter((c) => c[0] === "event").map((c) => c[1]);
    expect(events.filter((e) => e === GA4_FUNNEL_EVENTS.BOOKING_SUBMITTED)).toHaveLength(1);
    expect(store.size).toBe(1);
  });

  it("Paystack does not emit when booking is not persisted", () => {
    const { gtag } = stubGa4Window();
    expect(
      emitBookingSubmittedAfterPaystackVerify({
        bookingPersisted: false,
        bookingId: BOOKING_A,
        reference: "psk_1",
      }),
    ).toBe(false);
    expect(gtag).not.toHaveBeenCalled();
  });

  it("covered settled booking emits exactly one booking_submitted and never hits Paystack", async () => {
    const { gtag } = stubGa4Window();
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          booking: {
            id: BOOKING_B,
            payment_status: "success",
            status: "pending",
            service_slug: "regular-cleaning",
            total_paid_zar: 0,
            paystack_reference: "bv2_covered",
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const first = await finalizeCoveredBookingSubmitted({
      bookingId: BOOKING_B,
      accessToken: "tok",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const second = await finalizeCoveredBookingSubmitted({
      bookingId: BOOKING_B,
      accessToken: "tok",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(first.emitted).toBe(true);
    expect(second.emitted).toBe(false);
    expect(fetchImpl).toHaveBeenCalled();
    for (const call of fetchImpl.mock.calls as unknown as Array<[unknown, ...unknown[]]>) {
      expect(String(call[0])).not.toContain("/api/paystack/verify");
      expect(String(call[0])).toContain(`/api/customer/bookings/${BOOKING_B}`);
    }
    const events = gtag.mock.calls.filter((c) => c[0] === "event").map((c) => c[1]);
    expect(events.filter((e) => e === GA4_FUNNEL_EVENTS.BOOKING_SUBMITTED)).toHaveLength(1);
  });

  it("covered pending/unpaid booking emits zero", async () => {
    const { gtag } = stubGa4Window();
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          booking: {
            id: BOOKING_A,
            payment_status: "pending",
            status: "pending_payment",
            service_slug: "regular-cleaning",
          },
        }),
        { status: 200 },
      ),
    );
    const out = await finalizeCoveredBookingSubmitted({
      bookingId: BOOKING_A,
      accessToken: "tok",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(out.emitted).toBe(false);
    expect(out.result).toEqual({ ok: false, reason: "unsettled" });
    expect(gtag).not.toHaveBeenCalled();
  });

  it("area-review / unsettled helpers never allow emit", () => {
    expect(
      canEmitCoveredBookingSubmitted({
        id: BOOKING_A,
        payment_status: "pending",
        status: "pending",
      }),
    ).toBe(false);
    expect(
      canEmitCoveredBookingSubmitted({
        id: BOOKING_A,
        payment_status: "success",
        status: "cancelled",
      }),
    ).toBe(false);
  });

  it("refresh/rerender does not duplicate when storage is available", () => {
    const { gtag, store } = stubGa4Window();
    emitBookingSubmittedAfterPaystackVerify({
      bookingPersisted: true,
      bookingId: BOOKING_A,
      service: "regular-cleaning",
    });
    // Simulate refresh — same localStorage dedupe key
    emitBookingSubmittedAfterPaystackVerify({
      bookingPersisted: true,
      bookingId: BOOKING_A,
      service: "regular-cleaning",
    });
    expect(store.size).toBe(1);
    expect(gtag.mock.calls.filter((c) => c[1] === GA4_FUNNEL_EVENTS.BOOKING_SUBMITTED)).toHaveLength(1);
  });

  it("covered booking fetch that never resolves times out as retryable network", async () => {
    vi.useFakeTimers();
    const { gtag, store } = stubGa4Window();
    const fetchImpl = vi.fn((_url: RequestInfo | URL, init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal;
        if (!signal) return;
        const onAbort = () => reject(Object.assign(new Error("Aborted"), { name: "AbortError" }));
        if (signal.aborted) onAbort();
        else signal.addEventListener("abort", onAbort, { once: true });
      });
    });

    const pending = finalizeCoveredBookingSubmitted({
      bookingId: BOOKING_A,
      accessToken: "tok",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      timeoutMs: 50,
    });

    // Stalled request must terminate within the deadline
    await vi.advanceTimersByTimeAsync(50);
    const out = await pending;

    expect(out.emitted).toBe(false);
    expect(out.result).toEqual({ ok: false, reason: "network" });
    expect(gtag).not.toHaveBeenCalled();
    expect(store.size).toBe(0);

    // AbortController was passed and aborted
    const init = fetchImpl.mock.calls[0]?.[1] as RequestInit | undefined;
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect(init?.signal?.aborted).toBe(true);

    vi.useRealTimers();
  });

  it("AbortController timeout cleans up timer and leaves no unhandled rejection", async () => {
    vi.useFakeTimers();
    stubGa4Window();
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => {
      unhandled.push(reason);
    };
    process.on("unhandledRejection", onUnhandled);

    try {
      const fetchImpl = vi.fn((_url: RequestInfo | URL, init?: RequestInit) => {
        return new Promise<Response>((_resolve, reject) => {
          const signal = init?.signal;
          if (!signal) return;
          const onAbort = () => reject(Object.assign(new Error("Aborted"), { name: "AbortError" }));
          if (signal.aborted) onAbort();
          else signal.addEventListener("abort", onAbort, { once: true });
        });
      });

      const pending = finalizeCoveredBookingSubmitted({
        bookingId: BOOKING_A,
        accessToken: "tok",
        fetchImpl: fetchImpl as unknown as typeof fetch,
        timeoutMs: 25,
      });
      await vi.advanceTimersByTimeAsync(25);
      await expect(pending).resolves.toEqual({
        emitted: false,
        result: { ok: false, reason: "network" },
      });
      // Allow any stray microtasks
      await Promise.resolve();
      expect(unhandled).toHaveLength(0);
    } finally {
      process.off("unhandledRejection", onUnhandled);
      vi.useRealTimers();
    }
  });

  it("retry after timeout emits booking_submitted exactly once and writes dedupe only then", async () => {
    vi.useFakeTimers();
    const { gtag, store } = stubGa4Window();

    const stalled = vi.fn((_url: RequestInfo | URL, init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal;
        if (!signal) return;
        const onAbort = () => reject(Object.assign(new Error("Aborted"), { name: "AbortError" }));
        if (signal.aborted) onAbort();
        else signal.addEventListener("abort", onAbort, { once: true });
      });
    });

    const firstPending = finalizeCoveredBookingSubmitted({
      bookingId: BOOKING_B,
      accessToken: "tok",
      fetchImpl: stalled as unknown as typeof fetch,
      timeoutMs: 30,
    });
    await vi.advanceTimersByTimeAsync(30);
    const first = await firstPending;
    expect(first.emitted).toBe(false);
    expect(store.size).toBe(0);
    expect(gtag).not.toHaveBeenCalled();

    vi.useRealTimers();

    const okFetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          booking: {
            id: BOOKING_B,
            payment_status: "paid",
            status: "confirmed",
            service_slug: "regular-cleaning",
            total_paid_zar: 0,
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const second = await finalizeCoveredBookingSubmitted({
      bookingId: BOOKING_B,
      accessToken: "tok",
      fetchImpl: okFetch as unknown as typeof fetch,
    });
    const third = await finalizeCoveredBookingSubmitted({
      bookingId: BOOKING_B,
      accessToken: "tok",
      fetchImpl: okFetch as unknown as typeof fetch,
    });

    expect(second.emitted).toBe(true);
    expect(third.emitted).toBe(false);
    expect(store.size).toBe(1);
    expect(gtag.mock.calls.filter((c) => c[1] === GA4_FUNNEL_EVENTS.BOOKING_SUBMITTED)).toHaveLength(1);
  });
});

describe("success page / Step4 wiring", () => {
  it("covered path uses bookingId success URL and does not emit before navigation", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const step4 = await fs.readFile(
      path.join(process.cwd(), "src/features/booking-v2/steps/Step4Payment.tsx"),
      "utf8",
    );
    const successPage = await fs.readFile(
      path.join(process.cwd(), "app/booking/success/page.tsx"),
      "utf8",
    );
    expect(step4).toContain("bookingV2CoveredSuccessHref");
    expect(step4).toMatch(/!requiresPayment[\s\S]*bookingV2CoveredSuccessHref/);
    expect(step4).not.toMatch(/!requiresPayment[\s\S]{0,400}trackGa4BookingSubmitted/);
    expect(successPage).toContain("finalizeCoveredBookingSubmitted");
    expect(successPage).toContain("emitBookingSubmittedAfterPaystackVerify");
    expect(successPage).toContain("resolveBookingSuccessPath");
    expect(successPage).not.toMatch(/area_review[\s\S]{0,200}emitBookingSubmitted|area_review[\s\S]{0,200}trackGa4BookingSubmitted/);
  });
});
