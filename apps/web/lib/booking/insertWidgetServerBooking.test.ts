import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PricingRatesSnapshot } from "@/lib/pricing/pricingRatesSnapshot";
import type { ServiceTariff } from "@/lib/pricing/pricingConfig";

const mocks = vi.hoisted(() => {
  const tariff = (): ServiceTariff => ({
    base: 100,
    bedroom: 10,
    bathroom: 10,
    extraRoom: 5,
    duration: { base: 2, bedroom: 0.5, bathroom: 0.5, extraRoom: 0.25 },
  });

  const fakeSnapshot: PricingRatesSnapshot = {
    codeVersion: 1,
    services: {
      standard: tariff(),
      airbnb: tariff(),
      deep: tariff(),
      carpet: tariff(),
      move: tariff(),
    },
    extras: {},
    bundles: [],
  };

  const insertBookingRowUnified = vi.fn(
    async (_admin: unknown, _args: unknown) => ({
      ok: true as const,
      id: "00000000-0000-4000-8000-000000000099",
      row: null,
    }),
  );

  return { fakeSnapshot, insertBookingRowUnified };
});

vi.mock("@/lib/booking/createBookingUnified", () => ({
  insertBookingRowUnified: mocks.insertBookingRowUnified,
}));

vi.mock("@/lib/pricing/buildPricingRatesSnapshotFromDb", () => ({
  buildPricingRatesSnapshotFromDb: vi.fn(async () => mocks.fakeSnapshot),
}));

import { insertWidgetDraftBookingRow } from "@/lib/booking/insertWidgetServerBooking";

describe("insertWidgetDraftBookingRow", () => {
  beforeEach(() => {
    mocks.insertBookingRowUnified.mockClear();
  });

  const admin = {} as import("@supabase/supabase-js").SupabaseClient;

  const intake = {
    bedrooms: 2,
    bathrooms: 1,
    extraRooms: 0,
    service: "standard" as const,
    date: "2026-05-11",
    time: "09:00",
    extras: [] as string[],
    location: "Somewhere",
  };

  it("passes resolved user_id and customer_email into rowBase", async () => {
    const uid = "11111111-1111-4111-8111-111111111111";
    const r = await insertWidgetDraftBookingRow(admin, intake, {
      authUserId: uid,
      authEmail: "auth@example.com",
      guestEmail: "other@example.com",
    });
    expect(r.ok).toBe(true);
    expect(mocks.insertBookingRowUnified).toHaveBeenCalledTimes(1);
    const args = mocks.insertBookingRowUnified.mock.calls[0][1] as {
      rowBase: {
        user_id: string | null;
        customer_email: string | null;
        service_slug: string;
      };
    };
    expect(args.rowBase.user_id).toBe(uid);
    expect(args.rowBase.customer_email).toBe("auth@example.com");
    expect(args.rowBase.service_slug).toBe("standard");
  });

  it("guest path sets customer_email only", async () => {
    await insertWidgetDraftBookingRow(admin, intake, {
      guestEmail: "guest@example.com",
    });
    const args = mocks.insertBookingRowUnified.mock.calls[0][1] as {
      rowBase: {
        user_id: string | null;
        customer_email: string | null;
        service_slug: string;
      };
    };
    expect(args.rowBase.user_id).toBeNull();
    expect(args.rowBase.customer_email).toBe("guest@example.com");
    expect(args.rowBase.service_slug).toBe("standard");
  });

  it("sets service_slug from widget service key (normalized)", async () => {
    await insertWidgetDraftBookingRow(
      admin,
      { ...intake, service: "deep" },
      { guestEmail: "x@y.co" },
    );
    const args = mocks.insertBookingRowUnified.mock.calls[0][1] as {
      rowBase: { service_slug: string };
      serviceSlugForFlat: string;
    };
    expect(args.rowBase.service_slug).toBe("deep");
    expect(args.serviceSlugForFlat).toBe("deep");
  });
});
