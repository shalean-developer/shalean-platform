import { describe, expect, it } from "vitest";
import {
  adjacentDeepCleaningStage,
  deepCleaningDetailsStage,
  deepCleaningStageReady,
} from "@/src/features/booking-v2/steps/deepCleaningProgressiveDisclosure";

const completeAddress = {
  address: "45 Galway Road",
  suburb: "Athlone",
  contactPhone: "+27825915525",
  serviceAreaLocationId: "13bb6c75-58a4-4a89-9416-bab320aa203b",
};

const completeDetails = {
  propertyType: "house",
  bedrooms: "3",
  bathrooms: "2",
  extraRooms: "0",
  lastCleaned: "6_months_plus",
  hasPets: "no",
};

describe("deep cleaning progressive disclosure", () => {
  it("starts with address and waits for a resolved service area", () => {
    expect(deepCleaningDetailsStage({})).toBe("address");
    expect(
      deepCleaningDetailsStage({}, { ...completeAddress, serviceAreaLocationId: "" }),
    ).toBe("address");
  });

  it("reveals property after the address is complete", () => {
    expect(deepCleaningDetailsStage({}, completeAddress)).toBe("property");
  });

  it("requires room inputs before the combined condition and pets stage", () => {
    expect(
      deepCleaningDetailsStage(
        {
          propertyType: "house",
          bedrooms: "3",
          bathrooms: "2",
          extraRooms: "0",
        },
        completeAddress,
      ),
    ).toBe("pets");
  });

  it("keeps last-cleaned and pets answers together on the final details stage", () => {
    expect(
      deepCleaningStageReady(
        "pets",
        { ...completeDetails, lastCleaned: "" },
        completeAddress,
      ),
    ).toBe(false);
    expect(
      deepCleaningStageReady(
        "pets",
        { ...completeDetails, hasPets: "" },
        completeAddress,
      ),
    ).toBe(false);
    expect(deepCleaningStageReady("pets", completeDetails, completeAddress)).toBe(true);
  });

  it("continues directly from pets to schedule without an equipment stage", () => {
    expect(adjacentDeepCleaningStage("rooms", "next")).toBe("pets");
    expect(adjacentDeepCleaningStage("pets", "next")).toBeNull();
    expect(adjacentDeepCleaningStage("pets", "back")).toBe("rooms");
  });

  it("does not accept the retired equipment stage", () => {
    expect(deepCleaningStageReady("equipment", completeDetails, completeAddress)).toBe(false);
    expect(adjacentDeepCleaningStage("equipment", "next")).toBeNull();
  });
});
