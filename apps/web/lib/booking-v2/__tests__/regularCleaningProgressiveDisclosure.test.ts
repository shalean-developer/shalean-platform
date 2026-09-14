import { describe, expect, it } from "vitest";
import {
  isRegularCleaningStageComplete,
  regularCleaningDetailsStage,
} from "@/src/features/booking-v2/steps/regularCleaningProgressiveDisclosure";

describe("regular cleaning progressive disclosure", () => {
  it("starts with only the property-type stage", () => {
    expect(regularCleaningDetailsStage({})).toBe("property");
  });

  it("reveals rooms after property type is selected", () => {
    expect(regularCleaningDetailsStage({ propertyType: "house" })).toBe("rooms");
  });

  it("keeps pets hidden until all room choices are selected", () => {
    expect(
      regularCleaningDetailsStage({ propertyType: "house", bedrooms: "2" }),
    ).toBe("rooms");
  });

  it("reveals pets after bedrooms and bathrooms are selected", () => {
    expect(
      regularCleaningDetailsStage({
        propertyType: "apartment",
        bedrooms: "2",
        bathrooms: "1",
        extraRooms: "0",
      }),
    ).toBe("pets");
  });

  it("reveals the address after the pets choice is complete", () => {
    expect(
      regularCleaningDetailsStage({
        propertyType: "apartment",
        bedrooms: "2",
        bathrooms: "1",
        extraRooms: "0",
        hasPets: "no",
      }),
    ).toBe("address");
  });

  it("reveals equipment only after the required address details are complete", () => {
    expect(
      regularCleaningDetailsStage(
        {
          propertyType: "apartment",
          bedrooms: "2",
          bathrooms: "1",
          extraRooms: "0",
          hasPets: "no",
        },
        {
          address: "45 Galway Road",
          suburb: "Athlone",
          contactPhone: "+27825915525",
          serviceAreaLocationId: "13bb6c75-58a4-4a89-9416-bab320aa203b",
        },
      ),
    ).toBe("equipment");
  });

  it("keeps the address visible until its suburb resolves to a service area", () => {
    expect(
      regularCleaningDetailsStage(
        {
          propertyType: "house",
          bedrooms: "3",
          bathrooms: "2",
          extraRooms: "0",
          hasPets: "no",
        },
        {
          address: "39 Harvey Road",
          suburb: "Claremont",
          contactPhone: "+27825915525",
        },
      ),
    ).toBe("address");
  });

  it("treats only earlier stages as completed sidebar summaries", () => {
    expect(isRegularCleaningStageComplete("property", "address")).toBe(true);
    expect(isRegularCleaningStageComplete("rooms", "address")).toBe(true);
    expect(isRegularCleaningStageComplete("pets", "address")).toBe(true);
    expect(isRegularCleaningStageComplete("address", "address")).toBe(false);
    expect(isRegularCleaningStageComplete("equipment", "address")).toBe(false);
  });
});
