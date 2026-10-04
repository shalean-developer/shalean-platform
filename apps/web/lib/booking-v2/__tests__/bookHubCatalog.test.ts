import { describe, expect, it, vi } from "vitest";
import { loadBookHubCatalogSafely } from "@/lib/booking-v2/bookHubCatalog";

describe("loadBookHubCatalogSafely", () => {
  it("returns the authoritative catalog when loading succeeds", async () => {
    const catalog = { "regular-cleaning": { basePrice: 350 } } as never;
    const loader = vi.fn().mockResolvedValue({ catalog });

    await expect(loadBookHubCatalogSafely(loader)).resolves.toBe(catalog);
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("returns null instead of crashing the booking hub when the catalog read fails", async () => {
    const error = new Error("pricing catalog unavailable");
    const loader = vi.fn().mockRejectedValue(error);
    const onError = vi.fn();

    await expect(loadBookHubCatalogSafely(loader, onError)).resolves.toBeNull();
    expect(onError).toHaveBeenCalledWith(error);
  });
});
