import { describe, expect, it } from "vitest";
import { isNetworkError, isOfflineSignal } from "@/lib/cleaner/cleanerLifecycleNetworkSignal";

describe("isOfflineSignal", () => {
  it("returns true when navigator reports offline", () => {
    expect(isOfflineSignal(new Response("", { status: 200 }), { navigatorOnline: false })).toBe(true);
  });

  it("returns true for status 0 and 503", () => {
    expect(isOfflineSignal({ status: 0 } as Response)).toBe(true);
    expect(isOfflineSignal(new Response("", { status: 503 }))).toBe(true);
  });

  it("returns true for network-like errors", () => {
    expect(isOfflineSignal(null, { navigatorOnline: true, error: new TypeError("Failed to fetch") })).toBe(true);
  });

  it("returns false for normal online 200", () => {
    expect(isOfflineSignal(new Response("", { status: 200 }), { navigatorOnline: true })).toBe(false);
  });
});

describe("isNetworkError", () => {
  it("treats TypeError as network", () => {
    expect(isNetworkError(new TypeError("x"))).toBe(true);
  });
});
