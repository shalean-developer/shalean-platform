import { afterEach, describe, expect, it, vi } from "vitest";
import { normalizedAdminReadParams } from "./useAdminData";

describe("normalizedAdminReadParams", () => {
  afterEach(() => vi.useRealTimers());

  it("removes the implicit Johannesburg current-month range for All dates bookings", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-03T18:00:00.000Z"));

    expect(
      normalizedAdminReadParams("/api/admin/bookings", {
        filter: "all",
        page: "1",
        pageSize: "25",
        from: "2026-08-01",
        to: "2026-08-31",
      }),
    ).toEqual({ filter: "all", page: "1", pageSize: "25" });
  });

  it("preserves a user-selected custom booking range", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-03T18:00:00.000Z"));

    const params = {
      filter: "all",
      from: "2026-07-01",
      to: "2026-07-31",
    };
    expect(normalizedAdminReadParams("/api/admin/bookings", params)).toEqual(params);
  });

  it("does not alter other admin endpoints", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-03T18:00:00.000Z"));

    const params = {
      filter: "all",
      from: "2026-08-01",
      to: "2026-08-31",
    };
    expect(normalizedAdminReadParams("/api/admin/customers", params)).toEqual(params);
  });
});
