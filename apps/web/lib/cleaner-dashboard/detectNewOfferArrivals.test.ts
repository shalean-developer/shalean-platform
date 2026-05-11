import { describe, it, expect } from "vitest";
import { detectNewOfferArrivals } from "@/lib/cleaner-dashboard/detectNewOfferArrivals";

describe("detectNewOfferArrivals", () => {
  it("returns no new IDs and seeds previousIds during first hydration", () => {
    const r = detectNewOfferArrivals({
      previousIds: new Set(),
      currentIds: ["a", "b"],
      isFirstHydration: true,
      shouldSurface: true,
    });
    expect(r.newIds).toEqual([]);
    expect([...r.nextPreviousIds].sort()).toEqual(["a", "b"]);
  });

  it("returns the new ID once when an offer arrives", () => {
    const r = detectNewOfferArrivals({
      previousIds: new Set(["a"]),
      currentIds: ["a", "b"],
      isFirstHydration: false,
      shouldSurface: true,
    });
    expect(r.newIds).toEqual(["b"]);
    expect([...r.nextPreviousIds].sort()).toEqual(["a", "b"]);
  });

  it("does not re-fire for an offer already seen in the previous snapshot", () => {
    const r = detectNewOfferArrivals({
      previousIds: new Set(["a", "b"]),
      currentIds: ["a", "b"],
      isFirstHydration: false,
      shouldSurface: true,
    });
    expect(r.newIds).toEqual([]);
  });

  it("treats removal+re-add as a fresh arrival", () => {
    const first = detectNewOfferArrivals({
      previousIds: new Set(["a"]),
      currentIds: [],
      isFirstHydration: false,
      shouldSurface: true,
    });
    expect(first.newIds).toEqual([]);
    const second = detectNewOfferArrivals({
      previousIds: first.nextPreviousIds,
      currentIds: ["a"],
      isFirstHydration: false,
      shouldSurface: true,
    });
    expect(second.newIds).toEqual(["a"]);
  });

  it("suppresses newIds when shouldSurface is false but still tracks IDs", () => {
    const r = detectNewOfferArrivals({
      previousIds: new Set(),
      currentIds: ["a"],
      isFirstHydration: false,
      shouldSurface: false,
    });
    expect(r.newIds).toEqual([]);
    expect([...r.nextPreviousIds]).toEqual(["a"]);
  });

  it("ignores blank IDs and trims whitespace", () => {
    const r = detectNewOfferArrivals({
      previousIds: new Set(),
      currentIds: ["", "  ", "  c  "],
      isFirstHydration: false,
      shouldSurface: true,
    });
    expect(r.newIds).toEqual(["c"]);
    expect([...r.nextPreviousIds]).toEqual(["c"]);
  });
});
