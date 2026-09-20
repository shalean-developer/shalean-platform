import { describe, expect, it } from "vitest";
import {
  adjacentBookingDetailsStage,
  bookingDetailsAutoAdvanceTarget,
  bookingDetailsQuestionStage,
  bookingDetailsQuestionVisibleAtStage,
  bookingDetailsShowsExtras,
  bookingDetailsStage,
  bookingDetailsStageReady,
  usesProgressiveIndividualSchedule,
} from "@/src/features/booking-v2/steps/serviceProgressiveDisclosure";
import {
  SERVICE_CONFIG,
  type FormQuestion,
} from "@/src/features/booking-v2/config/serviceConfig";

const address = {
  address: "12 Ocean View Drive",
  suburb: "Claremont",
  contactPhone: "+27820000000",
  serviceAreaLocationId: "13bb6c75-58a4-4a89-9416-bab320aa203b",
};

describe("six-service progressive booking details", () => {
  it("keeps Regular stages unchanged", () => {
    expect(bookingDetailsStage("regular-cleaning", {}, address)).toBe("property");
    expect(bookingDetailsStage("regular-cleaning", { propertyType: "house" }, address)).toBe("rooms");
    expect(bookingDetailsStage("regular-cleaning", {
      propertyType: "house",
      bedrooms: "2",
      bathrooms: "1",
      extraRooms: "0",
    }, address)).toBe("pets");
    expect(bookingDetailsStage("regular-cleaning", {
      propertyType: "house",
      bedrooms: "2",
      bathrooms: "1",
      extraRooms: "0",
      hasPets: "no",
    }, address)).toBe("equipment");
    expect(bookingDetailsShowsExtras("regular-cleaning", "equipment")).toBe(true);
  });

  it("keeps Deep stages unchanged", () => {
    expect(bookingDetailsStage("deep-cleaning", {}, address)).toBe("property");
    expect(bookingDetailsStage("deep-cleaning", { propertyType: "house" }, address)).toBe("rooms");
    expect(bookingDetailsStage("deep-cleaning", {
      propertyType: "house",
      bedrooms: "2",
      bathrooms: "1",
      extraRooms: "0",
    }, address)).toBe("pets");
    expect(bookingDetailsShowsExtras("deep-cleaning", "pets")).toBe(true);
  });

  it("keeps the approved Moving flow", () => {
    expect(bookingDetailsStage("moving-cleaning", {}, address)).toBe("property");
    expect(bookingDetailsStage("moving-cleaning", { propertyType: "house" }, address)).toBe("move");
    expect(bookingDetailsStage("moving-cleaning", {
      propertyType: "house",
      moveType: "move_in",
    }, address)).toBe("rooms");
    expect(bookingDetailsStage("moving-cleaning", {
      propertyType: "house",
      moveType: "move_in",
      bedrooms: "2",
      bathrooms: "1",
      extraRooms: "0",
    }, address)).toBe("condition");
    expect(bookingDetailsShowsExtras("moving-cleaning", "condition")).toBe(true);
  });

  it("uses progressive Office stages without the duplicate Details frequency", () => {
    expect(bookingDetailsStage("office-cleaning", {}, address)).toBe("property");
    expect(bookingDetailsStage("office-cleaning", { officeType: "open_plan" }, address)).toBe("rooms");
    expect(bookingDetailsStage("office-cleaning", {
      officeType: "open_plan",
      officeSize: "medium",
      bathrooms: "2",
    }, address)).toBe("preferences");
    expect(
      bookingDetailsQuestionStage("office-cleaning", {
        key: "frequency",
        group: "rooms",
      }),
    ).toBeNull();
    expect(
      SERVICE_CONFIG["office-cleaning"].step1Questions.some((q) => q.key === "frequency"),
    ).toBe(false);
    expect(bookingDetailsShowsExtras("office-cleaning", "preferences")).toBe(true);
  });

  it("uses progressive Airbnb stages", () => {
    expect(bookingDetailsStage("airbnb-cleaning", {}, address)).toBe("property");
    expect(bookingDetailsStage("airbnb-cleaning", { propertyType: "apartment" }, address)).toBe("rooms");
    expect(bookingDetailsStage("airbnb-cleaning", {
      propertyType: "apartment",
      bedrooms: "1",
      bathrooms: "1",
      extraRooms: "0",
    }, address)).toBe("turnover");
    expect(bookingDetailsShowsExtras("airbnb-cleaning", "turnover")).toBe(true);
  });

  it("keeps the preceding selection visible while completing size/room details", () => {
    const property = { key: "propertyType", group: undefined };
    const officeType = { key: "officeType", group: undefined };
    const moveType = { key: "moveType", group: undefined };

    expect(
      bookingDetailsQuestionVisibleAtStage("regular-cleaning", property, "rooms"),
    ).toBe(true);
    expect(
      bookingDetailsQuestionVisibleAtStage("deep-cleaning", property, "rooms"),
    ).toBe(true);
    expect(
      bookingDetailsQuestionVisibleAtStage("airbnb-cleaning", property, "rooms"),
    ).toBe(true);
    expect(
      bookingDetailsQuestionVisibleAtStage("carpet-cleaning", property, "rooms"),
    ).toBe(true);
    expect(
      bookingDetailsQuestionVisibleAtStage("office-cleaning", officeType, "rooms"),
    ).toBe(true);

    // Moving preserves the earlier approved no-duplicate-Property-on-Rooms fix.
    expect(
      bookingDetailsQuestionVisibleAtStage("moving-cleaning", property, "move"),
    ).toBe(true);
    expect(
      bookingDetailsQuestionVisibleAtStage("moving-cleaning", property, "rooms"),
    ).toBe(false);
    expect(
      bookingDetailsQuestionVisibleAtStage("moving-cleaning", moveType, "rooms"),
    ).toBe(true);
  });

  it("uses progressive Carpet stages and follows the active room catalog", () => {
    expect(bookingDetailsStage("carpet-cleaning", {}, address)).toBe("property");
    expect(bookingDetailsStage("carpet-cleaning", { propertyType: "house" }, address)).toBe("rooms");
    expect(bookingDetailsStage("carpet-cleaning", {
      propertyType: "house",
      carpetRooms: "2",
      rugCount: "1",
      carpetType: "standard",
    }, address)).toBe("condition");

    const legacyQuestions: FormQuestion[] = [
      { key: "propertyType", label: "Property type", type: "radio", required: true },
      { key: "carpetRooms", label: "Rooms", type: "select", required: true, group: "rooms" },
      { key: "carpetType", label: "Carpet type", type: "select", required: true, group: "rooms" },
      { key: "sofaCount", label: "Sofas", type: "select", required: true, group: "rooms" },
      { key: "stains", label: "Stains", type: "radio", required: true },
      { key: "hasPets", label: "Pets", type: "radio", required: true },
    ];

    expect(bookingDetailsStage("carpet-cleaning", {
      propertyType: "house",
      carpetRooms: "2",
      carpetType: "standard",
    }, address, legacyQuestions)).toBe("rooms");
    expect(bookingDetailsStage("carpet-cleaning", {
      propertyType: "house",
      carpetRooms: "2",
      carpetType: "standard",
      sofaCount: "1",
    }, address, legacyQuestions)).toBe("condition");

    expect(
      bookingDetailsQuestionStage("carpet-cleaning", {
        key: "sofaCount",
        group: "rooms",
      }),
    ).toBe("rooms");
    expect(bookingDetailsShowsExtras("carpet-cleaning", "condition")).toBe(true);
  });

  it("validates required live questions for the new progressive services", () => {
    const officeQuestions = SERVICE_CONFIG["office-cleaning"].step1Questions;
    expect(
      bookingDetailsStageReady(
        "office-cleaning",
        "rooms",
        { officeType: "open_plan", officeSize: "medium", bathrooms: "2" },
        address,
        officeQuestions,
      ),
    ).toBe(true);
    expect(
      bookingDetailsStageReady(
        "office-cleaning",
        "rooms",
        { officeType: "open_plan", officeSize: "medium" },
        address,
        officeQuestions,
      ),
    ).toBe(false);
  });

  it("auto-advances only simple choice stages and keeps final detail stages button-controlled", () => {
    expect(
      bookingDetailsAutoAdvanceTarget("office-cleaning", "property", {
        officeType: "open_plan",
      }),
    ).toBe("rooms");
    expect(
      bookingDetailsAutoAdvanceTarget("airbnb-cleaning", "property", {
        propertyType: "apartment",
      }),
    ).toBe("rooms");
    expect(
      bookingDetailsAutoAdvanceTarget("carpet-cleaning", "property", {
        propertyType: "house",
      }),
    ).toBe("rooms");
    expect(
      bookingDetailsAutoAdvanceTarget("airbnb-cleaning", "turnover", {
        linens: "change",
      }),
    ).toBeNull();
  });

  it("supports deterministic back/next stages for every service", () => {
    expect(adjacentBookingDetailsStage("office-cleaning", "property", "back")).toBe("address");
    expect(adjacentBookingDetailsStage("office-cleaning", "rooms", "next")).toBe("preferences");
    expect(adjacentBookingDetailsStage("airbnb-cleaning", "turnover", "next")).toBeNull();
    expect(adjacentBookingDetailsStage("carpet-cleaning", "condition", "back")).toBe("rooms");
  });

  it("uses the Regular progressive schedule pattern for individual-cleaner services", () => {
    expect(usesProgressiveIndividualSchedule("regular-cleaning")).toBe(true);
    expect(usesProgressiveIndividualSchedule("office-cleaning")).toBe(true);
    expect(usesProgressiveIndividualSchedule("airbnb-cleaning")).toBe(true);
    expect(usesProgressiveIndividualSchedule("carpet-cleaning")).toBe(true);
    expect(usesProgressiveIndividualSchedule("deep-cleaning")).toBe(false);
    expect(usesProgressiveIndividualSchedule("moving-cleaning")).toBe(false);
  });
});
