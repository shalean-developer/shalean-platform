import { describe, expect, it } from "vitest";
import {
  adjacentRegularCleaningStage,
  isRegularCleaningStageComplete,
  regularCleaningAddressReady,
  regularCleaningAutoAdvanceTarget,
  regularCleaningDetailsStage,
  regularCleaningDetailsStageFromSearchParam,
} from "@/src/features/booking-v2/steps/regularCleaningProgressiveDisclosure";

const completeAddress = {
  address: "45 Galway Road",
  suburb: "Athlone",
  contactPhone: "+27825915525",
  serviceAreaLocationId: "13bb6c75-58a4-4a89-9416-bab320aa203b",
};

describe("regular cleaning progressive disclosure", () => {
  it("starts with the address stage", () => {
    expect(regularCleaningDetailsStage({})).toBe("address");
  });

  it("reveals property type after the address is complete", () => {
    expect(regularCleaningDetailsStage({}, completeAddress)).toBe("property");
  });

  it("reveals rooms after property type is selected", () => {
    expect(regularCleaningDetailsStage({ propertyType: "house" }, completeAddress)).toBe("rooms");
  });

  it("keeps pets hidden until all room choices are selected", () => {
    expect(
      regularCleaningDetailsStage({ propertyType: "house", bedrooms: "2" }, completeAddress),
    ).toBe("rooms");
  });

  it("reveals pets after bedrooms and bathrooms are selected", () => {
    expect(
      regularCleaningDetailsStage(
        {
          propertyType: "apartment",
          bedrooms: "2",
          bathrooms: "1",
          extraRooms: "0",
        },
        completeAddress,
      ),
    ).toBe("pets");
  });

  it("reveals equipment after the pets choice is complete", () => {
    expect(
      regularCleaningDetailsStage(
        {
          propertyType: "apartment",
          bedrooms: "2",
          bathrooms: "1",
          extraRooms: "0",
          hasPets: "no",
        },
        completeAddress,
      ),
    ).toBe("equipment");
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
        completeAddress,
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
    expect(isRegularCleaningStageComplete("address", "property")).toBe(true);
    expect(isRegularCleaningStageComplete("property", "address")).toBe(false);
    expect(isRegularCleaningStageComplete("rooms", "address")).toBe(false);
    expect(isRegularCleaningStageComplete("pets", "address")).toBe(false);
    expect(isRegularCleaningStageComplete("address", "address")).toBe(false);
    expect(isRegularCleaningStageComplete("equipment", "address")).toBe(false);
  });

  it("moves backward and forward through the controlled Step 1 sequence", () => {
    expect(adjacentRegularCleaningStage("address", "back")).toBeNull();
    expect(adjacentRegularCleaningStage("address", "next")).toBe("property");
    expect(adjacentRegularCleaningStage("property", "back")).toBe("address");
    expect(adjacentRegularCleaningStage("property", "next")).toBe("rooms");
    expect(adjacentRegularCleaningStage("equipment", "next")).toBeNull();
  });

  it("accepts only supported Step 1 section references", () => {
    expect(regularCleaningDetailsStageFromSearchParam("address")).toBe("address");
    expect(regularCleaningDetailsStageFromSearchParam("rooms")).toBe("rooms");
    expect(regularCleaningDetailsStageFromSearchParam("unknown")).toBeNull();
    expect(regularCleaningDetailsStageFromSearchParam(null)).toBeNull();
  });

  it("validates the address independently before moving to property details", () => {
    expect(regularCleaningAddressReady(completeAddress)).toBe(true);
    expect(regularCleaningAddressReady({ ...completeAddress, serviceAreaLocationId: "" })).toBe(false);
  });

  it("auto-advances from property as soon as a property type is selected", () => {
    expect(
      regularCleaningAutoAdvanceTarget("property", { propertyType: "house" }),
    ).toBe("rooms");
    expect(regularCleaningAutoAdvanceTarget("property", {})).toBeNull();
  });

  it("keeps rooms button-controlled even after every room choice is explicit", () => {
    expect(
      regularCleaningAutoAdvanceTarget("rooms", {
        bedrooms: "2",
        bathrooms: "1",
      }),
    ).toBeNull();
    expect(
      regularCleaningAutoAdvanceTarget("rooms", {
        bedrooms: "2",
        bathrooms: "1",
        extraRooms: "0",
      }),
    ).toBeNull();
  });

  it("auto-advances from pets as soon as the choice is explicit", () => {
    expect(
      regularCleaningAutoAdvanceTarget("pets", { hasPets: "no" }),
    ).toBe("equipment");
    expect(regularCleaningAutoAdvanceTarget("pets", {})).toBeNull();
  });
});
