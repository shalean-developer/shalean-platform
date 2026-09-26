import { describe, expect, it } from "vitest";
import { selectedCleanerIdsAreVisibleAndAvailable } from "@/src/features/booking-v2/components/CleanerPreferenceSection";
import type { AvailableCleanerV2 } from "@/src/features/booking-v2/types";

function cleaner(id: string, isAvailable: boolean): AvailableCleanerV2 {
  return { id, isAvailable } as unknown as AvailableCleanerV2;
}

describe("selectedCleanerIdsAreVisibleAndAvailable", () => {
  it("allows no explicit preference", () => {
    expect(selectedCleanerIdsAreVisibleAndAvailable([], [])).toBe(true);
  });

  it("keeps a selected cleaner only when the current list visibly contains them as available", () => {
    expect(
      selectedCleanerIdsAreVisibleAndAvailable(
        ["cleaner-a"],
        [cleaner("cleaner-a", true), cleaner("cleaner-b", true)],
      ),
    ).toBe(true);
  });

  it("rejects hidden, stale, or now-unavailable persisted selections", () => {
    expect(
      selectedCleanerIdsAreVisibleAndAvailable(["cleaner-a"], [cleaner("cleaner-b", true)]),
    ).toBe(false);
    expect(
      selectedCleanerIdsAreVisibleAndAvailable(["cleaner-a"], [cleaner("cleaner-a", false)]),
    ).toBe(false);
    expect(selectedCleanerIdsAreVisibleAndAvailable(["cleaner-a"], [])).toBe(false);
  });
});
