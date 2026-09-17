import { describe, expect, it } from "vitest";
import {
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

  it("keeps condition and room inputs together before pets", () => {
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
    ).toBe("rooms");
    expect(
      deepCleaningDetailsStage(
        {
          propertyType: "house",
          bedrooms: "3",
          bathrooms: "2",
          extraRooms: "0",
          lastCleaned: "6_months_plus",
        },
        completeAddress,
      ),
    ).toBe("pets");
  });

  it("reveals add-ons only after the pets choice", () => {
    expect(deepCleaningDetailsStage(completeDetails, completeAddress)).toBe("equipment");
  });

  it("requires every room and condition choice before continuing", () => {
    expect(
      deepCleaningStageReady(
        "rooms",
        { ...completeDetails, lastCleaned: "" },
        completeAddress,
      ),
    ).toBe(false);
    expect(deepCleaningStageReady("rooms", completeDetails, completeAddress)).toBe(true);
  });

  it("requires an explicit pets answer", () => {
    expect(
      deepCleaningStageReady("pets", { ...completeDetails, hasPets: "" }, completeAddress),
    ).toBe(false);
    expect(deepCleaningStageReady("pets", completeDetails, completeAddress)).toBe(true);
  });
});
