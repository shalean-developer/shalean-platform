import { describe, expect, it } from "vitest";

import {
  BATHROOM_CHIP_VALUES,
  BEDROOM_CHIP_VALUES,
  EXTRA_ROOM_CHIP_VALUES,
  roomCountChipLabel,
  roomCountToChip,
} from "@/src/features/booking-v2/config/roomCountOptions";

describe("roomCountOptions", () => {
  it("exposes the compact bedroom, bathroom, and extra-room chip ranges", () => {
    expect([...BEDROOM_CHIP_VALUES]).toEqual(["0", "1", "2", "3+"]);
    expect([...BATHROOM_CHIP_VALUES]).toEqual(["1", "2", "3", "4+"]);
    expect([...EXTRA_ROOM_CHIP_VALUES]).toEqual(["0", "1", "2", "3+"]);
  });

  it("labels threshold chips as custom", () => {
    expect(roomCountChipLabel("3+")).toBe("3+ Custom");
    expect(roomCountChipLabel("4+")).toBe("4+ Custom");
    expect(roomCountChipLabel("3")).toBe("3");
  });

  it("maps exact counts to each selector's custom threshold", () => {
    expect(roomCountToChip("8", "bedrooms")).toBe("3+");
    expect(roomCountToChip(7, "bathrooms")).toBe("4+");
    expect(roomCountToChip(5, "extraRooms")).toBe("3+");
    expect(roomCountToChip("0", "bedrooms")).toBe("0");
    expect(roomCountToChip("3", "bathrooms")).toBe("3");
    expect(roomCountToChip("2", "extraRooms")).toBe("2");
  });
});
