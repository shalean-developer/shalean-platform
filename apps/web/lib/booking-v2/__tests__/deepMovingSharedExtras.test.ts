import { describe, expect, it } from "vitest";
import {
  extraSlugsForService,
  isExtraSlugAllowedForService,
} from "@/lib/booking-v2/serviceExtraSlugs";

const shared = [
  "balcony-cleaning",
  "deep-carpet-cleaning",
  "ceiling-cleaning",
  "garage-cleaning",
  "mattress-cleaning",
  "outside-windows",
];

describe("Deep and Moving shared extras", () => {
  it("uses the same canonical allowlist for both services", () => {
    expect(extraSlugsForService("deep-cleaning")).toEqual(shared);
    expect(extraSlugsForService("moving-cleaning")).toEqual(shared);
  });

  it("allows every shared extra on both services", () => {
    for (const slug of shared) {
      expect(isExtraSlugAllowedForService("deep-cleaning", slug)).toBe(true);
      expect(isExtraSlugAllowedForService("moving-cleaning", slug)).toBe(true);
    }
  });
});
