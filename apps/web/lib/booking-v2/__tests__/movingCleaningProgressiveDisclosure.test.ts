import { describe, expect, it } from "vitest";
import {
  adjacentMovingCleaningStage,
  movingCleaningAutoAdvanceTarget,
  movingCleaningDetailsStage,
  movingCleaningShowsExtras,
  movingCleaningStageReady,
} from "@/src/features/booking-v2/steps/movingCleaningProgressiveDisclosure";

const address = {
  address: "12 Ocean View Drive",
  suburb: "Claremont",
  contactPhone: "+27825915525",
  serviceAreaLocationId: "13bb6c75-58a4-4a89-9416-bab320aa203b",
};

describe("moving cleaning progressive disclosure", () => {
  it("follows address → property → move → rooms → condition", () => {
    expect(movingCleaningDetailsStage({})).toBe("address");
    expect(movingCleaningDetailsStage({}, address)).toBe("property");
    expect(movingCleaningDetailsStage({ propertyType: "house" }, address)).toBe("move");
    expect(movingCleaningDetailsStage({ propertyType: "house", moveType: "move_in" }, address)).toBe("rooms");
    expect(movingCleaningDetailsStage({
      propertyType: "house",
      moveType: "move_in",
      bedrooms: "2",
      bathrooms: "1",
      extraRooms: "0",
    }, address)).toBe("condition");
  });

  it("requires move-out deposit inspection but not for move-in", () => {
    const base = { furnished: "no", hasPets: "no" };
    expect(movingCleaningStageReady("condition", { ...base, moveType: "move_in" }, address)).toBe(true);
    expect(movingCleaningStageReady("condition", { ...base, moveType: "move_out" }, address)).toBe(false);
    expect(movingCleaningStageReady("condition", { ...base, moveType: "move_out", depositInspection: "yes" }, address)).toBe(true);
  });

  it("shows extras only on the final condition stage", () => {
    expect(movingCleaningShowsExtras("rooms")).toBe(false);
    expect(movingCleaningShowsExtras("condition")).toBe(true);
  });

  it("keeps rooms and final condition button-controlled", () => {
    expect(movingCleaningAutoAdvanceTarget("property", { propertyType: "apartment" })).toBe("move");
    expect(movingCleaningAutoAdvanceTarget("move", { moveType: "move_out" })).toBe("rooms");
    expect(movingCleaningAutoAdvanceTarget("rooms", { bedrooms: "2", bathrooms: "1", extraRooms: "0" })).toBeNull();
  });

  it("supports deterministic back and next navigation", () => {
    expect(adjacentMovingCleaningStage("address", "back")).toBeNull();
    expect(adjacentMovingCleaningStage("address", "next")).toBe("property");
    expect(adjacentMovingCleaningStage("condition", "back")).toBe("rooms");
    expect(adjacentMovingCleaningStage("condition", "next")).toBeNull();
  });
});
