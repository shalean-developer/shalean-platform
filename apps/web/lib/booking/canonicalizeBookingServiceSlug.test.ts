import { describe, expect, it } from "vitest";

import { canonicalizeBookingServiceSlug } from "@/lib/booking/canonicalizeBookingServiceSlug";

describe("canonicalizeBookingServiceSlug", () => {
  const activeServiceIds = ["standard", "airbnb", "deep", "move", "carpet"];

  it.each([
    ["standard", "standard"],
    ["standard_cleaning", "standard"],
    ["Standard Cleaning", "standard"],
    ["regular", "standard"],
    ["regular_cleaning", "standard"],
    ["quick", "standard"],
    ["quick_cleaning", "standard"],
    ["Quick Cleaning", "standard"],
    ["airbnb", "airbnb"],
    ["airbnb_cleaning", "airbnb"],
    ["deep", "deep"],
    ["deep_cleaning", "deep"],
    ["move", "move"],
    ["move_cleaning", "move"],
    ["move_in_out_cleaning", "move"],
    ["carpet", "carpet"],
    ["carpet_cleaning", "carpet"],
    ["", "standard"],
    [null, "standard"],
    ["unknown", "standard"],
  ])("normalizes %s to %s", (input, expected) => {
    const actual = canonicalizeBookingServiceSlug(input);
    expect(actual).toBe(expected);
    expect(activeServiceIds).toContain(actual);
  });
});
