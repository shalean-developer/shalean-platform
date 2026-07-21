import { describe, expect, it } from "vitest";
import {
  assertBookingScope,
  buildUnifiedInsertDurationPatch,
} from "@/lib/booking/createBookingUnified";

describe("assertBookingScope", () => {
  it("accepts 1–20 rooms and bathrooms", () => {
    expect(() => assertBookingScope(1, 1)).not.toThrow();
    expect(() => assertBookingScope(20, 20)).not.toThrow();
  });

  it("rejects out-of-range or non-finite", () => {
    expect(() => assertBookingScope(0, 1)).toThrow(/between 1 and 20/);
    expect(() => assertBookingScope(1, 21)).toThrow(/between 1 and 20/);
    expect(() => assertBookingScope(Number.NaN, 1)).toThrow(/finite/);
  });
});

describe("buildUnifiedInsertDurationPatch", () => {
  it("derives duration from rooms + service when rowBase has none", () => {
    const patch = buildUnifiedInsertDurationPatch({
      rowBase: {},
      rooms: 4,
      bathrooms: 3,
      extras: [],
      serviceSlugForFlat: "deep",
      dateForFlat: "2026-07-22",
      timeForFlat: "09:00",
    });
    expect(patch.duration_minutes).toEqual(expect.any(Number));
    expect(patch.duration_minutes as number).toBeGreaterThanOrEqual(120);
    expect(patch.estimated_duration_minutes).toBe(patch.duration_minutes);
    expect(patch.duration_hours).toEqual(expect.any(Number));
    expect(patch.estimated_finish_at).toEqual(expect.any(String));
  });

  it("preserves an explicit duration_minutes on rowBase", () => {
    const patch = buildUnifiedInsertDurationPatch({
      rowBase: { duration_minutes: 265 },
      rooms: 1,
      bathrooms: 1,
      extras: [],
      serviceSlugForFlat: "standard",
      dateForFlat: "2026-07-22",
      timeForFlat: "10:00",
    });
    expect(patch.duration_minutes).toBe(265);
    expect(patch.estimated_duration_minutes).toBe(265);
  });

  it("includes extras slugs in workload derivation", () => {
    const without = buildUnifiedInsertDurationPatch({
      rowBase: {},
      rooms: 4,
      bathrooms: 4,
      extras: [],
      serviceSlugForFlat: "deep",
      dateForFlat: null,
      timeForFlat: null,
    });
    const withExtra = buildUnifiedInsertDurationPatch({
      rowBase: {},
      rooms: 4,
      bathrooms: 4,
      extras: [{ slug: "garage-cleaning", name: "garage-cleaning", price: 0 }],
      serviceSlugForFlat: "deep",
      dateForFlat: null,
      timeForFlat: null,
    });
    expect(withExtra.duration_minutes as number).toBeGreaterThanOrEqual(
      without.duration_minutes as number,
    );
  });
});
