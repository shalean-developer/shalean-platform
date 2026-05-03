import { describe, expect, it } from "vitest";

import { parseCleanerAvailabilityWeekdaysStrict } from "@/lib/cleaner/availabilityWeekdays";

describe("parseCleanerAvailabilityWeekdaysStrict", () => {
  it("returns empty for null or non-array", () => {
    expect(parseCleanerAvailabilityWeekdaysStrict(null)).toEqual([]);
    expect(parseCleanerAvailabilityWeekdaysStrict(undefined)).toEqual([]);
    expect(parseCleanerAvailabilityWeekdaysStrict({})).toEqual([]);
  });

  it("returns empty for empty array (no default all-days)", () => {
    expect(parseCleanerAvailabilityWeekdaysStrict([])).toEqual([]);
  });

  it("orders mon..sun subset", () => {
    expect(parseCleanerAvailabilityWeekdaysStrict(["fri", "mon"])).toEqual(["mon", "fri"]);
  });
});
