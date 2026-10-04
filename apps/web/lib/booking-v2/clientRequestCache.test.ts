import { beforeEach, describe, expect, it, vi } from "vitest";
import { cachedClientRequest, clearClientRequestCacheForTests } from "./clientRequestCache";

describe("cachedClientRequest", () => {
  beforeEach(() => clearClientRequestCacheForTests());

  it("coalesces equivalent in-flight requests", async () => {
    const load = vi.fn(async () => ({ ok: true }));
    const [first, second] = await Promise.all([
      cachedClientRequest("same", load, 1_000),
      cachedClientRequest("same", load, 1_000),
    ]);
    expect(load).toHaveBeenCalledTimes(1);
    expect(first).toEqual(second);
  });

  it("does not retain a rejected request", async () => {
    const load = vi.fn()
      .mockRejectedValueOnce(new Error("temporary"))
      .mockResolvedValueOnce("recovered");
    await expect(cachedClientRequest("retry", load, 1_000)).rejects.toThrow("temporary");
    await expect(cachedClientRequest("retry", load, 1_000)).resolves.toBe("recovered");
    expect(load).toHaveBeenCalledTimes(2);
  });
});
