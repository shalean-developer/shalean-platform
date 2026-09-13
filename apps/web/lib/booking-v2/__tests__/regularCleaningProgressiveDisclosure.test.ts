import { describe, expect, it } from "vitest";
import { regularCleaningDetailsStage } from "@/src/features/booking-v2/steps/regularCleaningProgressiveDisclosure";

describe("regular cleaning progressive disclosure", () => {
  it("starts with only the property-type stage", () => {
    expect(regularCleaningDetailsStage({})).toBe("property");
  });

  it("reveals rooms after property type is selected", () => {
    expect(regularCleaningDetailsStage({ propertyType: "house" })).toBe("rooms");
  });

  it("keeps pets hidden until both required room counts are selected", () => {
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
      }),
    ).toBe("pets");
  });

  it("reveals the address after the pets choice is complete", () => {
    expect(
      regularCleaningDetailsStage({
        propertyType: "apartment",
        bedrooms: "2",
        bathrooms: "1",
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
          hasPets: "no",
        },
        {
          address: "45 Galway Road",
          suburb: "Athlone",
          contactPhone: "+27825915525",
          serviceAreaLocationId: "8cd1b7b8-7f3f-4d5d-8fe8-c90855cad5c7",
        },
      ),
    ).toBe("equipment");
  });
});
