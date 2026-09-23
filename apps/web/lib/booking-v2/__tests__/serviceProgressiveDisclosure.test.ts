import { readFileSync } from "node:fs";
import { join } from "node:path";
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
import { SERVICE_CONFIG } from "@/src/features/booking-v2/config/serviceConfig";

const address = {
  address: "12 Ocean View Drive",
  suburb: "Claremont",
  contactPhone: "+27820000000",
  serviceAreaLocationId: "13bb6c75-58a4-4a89-9416-bab320aa203b",
};

describe("six-service progressive booking details", () => {
  it("uses the shortened Carpet room label everywhere", () => {
    const carpetRooms = SERVICE_CONFIG["carpet-cleaning"].step1Questions.find(
      (question) => question.key === "carpetRooms",
    );
    expect(carpetRooms?.label).toBe("Carpeted rooms");

    const catalogSeed = readFileSync(
      join(process.cwd(), "../../supabase/seeds/booking_v2_catalog_config.json"),
      "utf8",
    );
    expect(catalogSeed).toContain('"label": "Carpeted rooms"');
    expect(catalogSeed).not.toContain('"label": "Number of carpeted rooms"');

    const runtimeCatalogSource = readFileSync(
      join(process.cwd(), "lib/booking-v2/loadBookingV2Catalog.ts"),
      "utf8",
    );
    expect(runtimeCatalogSource).toContain(
      'serviceSlug === "carpet-cleaning"',
    );
    expect(runtimeCatalogSource).toContain(
      "SERVICE_CONFIG[serviceSlug].step1Questions",
    );
  });


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
    expect(bookingDetailsStage("office-cleaning", {}, address)).toBe("rooms");
    expect(bookingDetailsStage("office-cleaning", {
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
    expect(bookingDetailsStageReady(
      "airbnb-cleaning",
      "turnover",
      { linens: "change", keyAccess: "lockbox" },
      address,
      SERVICE_CONFIG["airbnb-cleaning"].step1Questions,
    )).toBe(true);
    expect(bookingDetailsShowsExtras("airbnb-cleaning", "turnover")).toBe(true);
  });

  it("keeps the preceding selection visible while completing size/room details", () => {
    const property = { key: "propertyType", group: undefined };
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
      bookingDetailsQuestionVisibleAtStage("moving-cleaning", property, "move"),
    ).toBe(true);
    expect(
      bookingDetailsQuestionVisibleAtStage("moving-cleaning", property, "rooms"),
    ).toBe(true);
    expect(
      bookingDetailsQuestionVisibleAtStage("moving-cleaning", moveType, "rooms"),
    ).toBe(true);
  });

  it("uses the simplified canonical Carpet stages", () => {
    const questionKeys = SERVICE_CONFIG["carpet-cleaning"].step1Questions.map(
      (question) => question.key,
    );
    expect(questionKeys).toEqual([
      "propertyType",
      "carpetRooms",
      "rugCount",
      "carpetType",
      "stains",
    ]);
    expect(questionKeys).not.toContain("sofaCount");
    expect(questionKeys).not.toContain("hasPets");
    expect(questionKeys).not.toContain("specialInstructions");

    expect(bookingDetailsStage("carpet-cleaning", {}, address)).toBe("property");
    expect(
      bookingDetailsStage("carpet-cleaning", { propertyType: "house" }, address),
    ).toBe("rooms");
    expect(
      bookingDetailsStage(
        "carpet-cleaning",
        {
          propertyType: "house",
          carpetRooms: "2",
          rugCount: "1",
          carpetType: "standard",
        },
        address,
      ),
    ).toBe("condition");
    expect(
      bookingDetailsStageReady(
        "carpet-cleaning",
        "condition",
        { stains: "yes" },
        address,
        SERVICE_CONFIG["carpet-cleaning"].step1Questions,
      ),
    ).toBe(true);
    expect(bookingDetailsShowsExtras("carpet-cleaning", "condition")).toBe(true);
  });

  it("falls back to the current Carpet room contract when catalog questions are unavailable", () => {
    expect(
      bookingDetailsStageReady(
        "carpet-cleaning",
        "rooms",
        { propertyType: "house", carpetRooms: "2", carpetType: "standard" },
        address,
      ),
    ).toBe(false);
    expect(
      bookingDetailsStageReady(
        "carpet-cleaning",
        "rooms",
        {
          propertyType: "house",
          carpetRooms: "2",
          rugCount: "0",
          carpetType: "standard",
        },
        address,
      ),
    ).toBe(true);
  });

  it("validates required live questions for the new progressive services", () => {
    const officeQuestions = SERVICE_CONFIG["office-cleaning"].step1Questions;
    expect(
      bookingDetailsStageReady(
        "office-cleaning",
        "rooms",
        { officeSize: "medium", bathrooms: "2" },
        address,
        officeQuestions,
      ),
    ).toBe(true);
    expect(
      bookingDetailsStageReady(
        "office-cleaning",
        "rooms",
        { officeSize: "medium" },
        address,
        officeQuestions,
      ),
    ).toBe(false);
  });

  it("auto-advances only simple choice stages and keeps final detail stages button-controlled", () => {
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
    expect(adjacentBookingDetailsStage("office-cleaning", "rooms", "back")).toBe("address");
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
