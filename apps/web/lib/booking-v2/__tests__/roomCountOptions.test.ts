import { describe, expect, it } from "vitest";

import {
  BATHROOM_CHIP_VALUES,
  BEDROOM_CHIP_VALUES,
  roomCountToChip,
} from "@/src/features/booking-v2/config/roomCountOptions";

describe("roomCountOptions", () => {
  it("exposes UAT bedroom and bathroom chip ranges", () => {
    expect([...BEDROOM_CHIP_VALUES]).toEqual(["0", "1", "2", "3", "4", "5", "6+"]);
    expect([...BATHROOM_CHIP_VALUES]).toEqual(["1", "2", "3", "4", "5", "6+"]);
  });

  it("maps exact counts >= 6 to the 6+ chip", () => {
    expect(roomCountToChip("8", "bedrooms")).toBe("6+");
    expect(roomCountToChip(7, "bathrooms")).toBe("6+");
    expect(roomCountToChip("0", "bedrooms")).toBe("0");
    expect(roomCountToChip("3", "bathrooms")).toBe("3");
  });
});
