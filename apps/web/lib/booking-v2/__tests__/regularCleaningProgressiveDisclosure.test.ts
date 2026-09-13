import { describe, expect, it } from "vitest";
import { regularCleaningDetailsStage } from "@/src/features/booking-v2/steps/regularCleaningProgressiveDisclosure";

describe("regular cleaning progressive disclosure", () => {
  it("starts with only the property-type stage", () => {
    expect(regularCleaningDetailsStage({})).toBe("property");
  });

  it("reveals rooms after property type is selected", () => {
    expect(regularCleaningDetailsStage({ propertyType: "house" })).toBe("rooms");
  });

  it("keeps remaining details hidden until both required room counts are selected", () => {
    expect(
      regularCleaningDetailsStage({ propertyType: "house", bedrooms: "2" }),
    ).toBe("rooms");
  });

  it("reveals the remaining details after bedrooms and bathrooms are selected", () => {
    expect(
      regularCleaningDetailsStage({
        propertyType: "apartment",
        bedrooms: "2",
        bathrooms: "1",
      }),
    ).toBe("remaining");
  });
});
