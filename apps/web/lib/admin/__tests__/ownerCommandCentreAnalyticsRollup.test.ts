import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { loadOwnerCommandCentreAnalyticsRollup } from "@/lib/admin/ownerCommandCentreAnalyticsRollup";

const window = {
  startMs: Date.parse("2026-08-01T00:00:00.000Z"),
  endMs: Date.parse("2026-09-01T00:00:00.000Z"),
};
const now = new Date("2026-09-01T00:00:00.000Z");

describe("loadOwnerCommandCentreAnalyticsRollup", () => {
  it("uses the single-row RPC result without reading booking rows", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          total_bookings: "4",
          total_revenue_zar: "2400",
          distinct_customers: "3",
          returning_customers: "2",
          service_pairs: [
            { service: "Standard Cleaning", service_slug: "standard-cleaning", count: "2" },
            { service: null, service_slug: "standard-cleaning", count: 1 },
            { service: "Deep Cleaning", service_slug: "deep-cleaning", count: 1 },
          ],
        },
      ],
      error: null,
    });
    const from = vi.fn();

    const result = await loadOwnerCommandCentreAnalyticsRollup(
      { rpc, from } as never,
      window,
      now,
    );

    expect(rpc).toHaveBeenCalledWith("owner_command_centre_analytics_rollup", {
      p_start: "2026-08-01T00:00:00.000Z",
      p_end: "2026-09-01T00:00:00.000Z",
    });
    expect(from).not.toHaveBeenCalled();
    expect(result).toEqual({
      retentionPct: 66.7,
      totalBookingsWindow: 4,
      avgBookingValueZar: 600,
      bookingServices: [
        { label: "Standard Cleaning", count: 3, revenueZar: null },
        { label: "Deep Cleaning", count: 1, revenueZar: null },
      ],
    });
  });

  it("uses the bounded row fallback only while the additive RPC is missing", async () => {
    const rpc = vi.fn(async (name: string) => {
      if (name === "owner_command_centre_analytics_rollup") {
        return { data: null, error: { code: "PGRST202", message: "not in schema cache" } };
      }
      return { data: [{ customer_ids: ["prior-customer"] }], error: null };
    });
    const limit = vi.fn().mockResolvedValue({ data: [], error: null });
    const query: Record<string, ReturnType<typeof vi.fn>> = {};
    for (const method of ["select", "or", "order"] as const) {
      query[method] = vi.fn(() => query);
    }
    query.limit = limit;
    const from = vi.fn(() => query);

    const result = await loadOwnerCommandCentreAnalyticsRollup(
      { rpc, from } as never,
      window,
      now,
    );

    expect(from).toHaveBeenCalledTimes(1);
    expect(from).toHaveBeenCalledWith("bookings");
    expect(limit).toHaveBeenCalledWith(15_000);
    expect(result).toEqual({
      retentionPct: null,
      totalBookingsWindow: 0,
      avgBookingValueZar: 0,
      bookingServices: [],
    });
  });

  it("does not trigger the large fallback for operational RPC failures", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { code: "42501", message: "permission denied" },
    });
    const from = vi.fn();

    await expect(
      loadOwnerCommandCentreAnalyticsRollup({ rpc, from } as never, window, now),
    ).rejects.toThrow("permission denied");
    expect(from).not.toHaveBeenCalled();
  });
});
