import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { purchaseValueZar } from "@/lib/ads/purchaseConversionTypes";
import { sendMetaCapiPurchase, sendGa4MeasurementPurchase } from "@/lib/ads/sendServerPurchaseConversions";

describe("purchaseValueZar", () => {
  it("prefers cents then zar fallback", () => {
    expect(purchaseValueZar(340000)).toBe(3400);
    expect(purchaseValueZar(null, 99.5)).toBe(99.5);
    expect(purchaseValueZar(0, 0)).toBe(0);
  });
});

describe("sendMetaCapiPurchase", () => {
  const originalFetch = global.fetch;
  const env = process.env;

  beforeEach(() => {
    process.env = { ...env };
    delete process.env.META_PIXEL_ID;
    delete process.env.NEXT_PUBLIC_META_PIXEL_ID;
    delete process.env.META_CAPI_ACCESS_TOKEN;
    delete process.env.META_CAPI_TEST_EVENT_CODE;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env = env;
    vi.restoreAllMocks();
  });

  it("skips when not configured", async () => {
    const res = await sendMetaCapiPurchase({
      eventId: "ref-1",
      valueZar: 100,
      currency: "ZAR",
      email: "a@b.com",
    });
    expect(res).toEqual({ ok: false, skipped: true, reason: "meta_capi_not_configured" });
  });

  it("posts Purchase with hashed email and event_id", async () => {
    process.env.META_PIXEL_ID = "999";
    process.env.META_CAPI_ACCESS_TOKEN = "token";
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ events_received: 1 }), { status: 200 }));
    global.fetch = fetchMock as unknown as typeof fetch;

    const res = await sendMetaCapiPurchase({
      eventId: "pay_ref_abc",
      valueZar: 3400,
      currency: "ZAR",
      email: "Customer@Example.com",
      bookingId: "00000000-0000-4000-8000-000000000001",
    });

    expect(res).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledOnce();
    const call = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(String(call[1]?.body)) as {
      data: Array<{ event_name: string; event_id: string; user_data: { em?: string }; custom_data: { value: number } }>;
    };
    expect(body.data[0]?.event_name).toBe("Purchase");
    expect(body.data[0]?.event_id).toBe("pay_ref_abc");
    expect(body.data[0]?.custom_data.value).toBe(3400);
    expect(body.data[0]?.user_data.em).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe("sendGa4MeasurementPurchase", () => {
  const originalFetch = global.fetch;
  const env = process.env;

  beforeEach(() => {
    process.env = { ...env };
    delete process.env.GA4_MEASUREMENT_PROTOCOL_SECRET;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env = env;
    vi.restoreAllMocks();
  });

  it("skips when secret missing", async () => {
    const res = await sendGa4MeasurementPurchase({
      eventId: "ref-1",
      valueZar: 50,
      currency: "ZAR",
    });
    expect(res).toEqual({ ok: false, skipped: true, reason: "ga4_mp_not_configured" });
  });

  it("posts purchase event when configured", async () => {
    process.env.GA4_MEASUREMENT_PROTOCOL_SECRET = "secret";
    process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID = "G-TEST";
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    global.fetch = fetchMock as unknown as typeof fetch;

    const res = await sendGa4MeasurementPurchase({
      eventId: "ref-xyz",
      valueZar: 200,
      currency: "ZAR",
      bookingId: "b1",
    });
    expect(res).toEqual({ ok: true });
    const call = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(String(call[0])).toContain("measurement_id=G-TEST");
  });
});
