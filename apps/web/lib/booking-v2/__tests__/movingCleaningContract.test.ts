import { describe, expect, it } from "vitest";

import { SERVICE_CONFIG } from "@/src/features/booking-v2/config/serviceConfig";

describe("Moving Cleaning booking contract", () => {
  const config = SERVICE_CONFIG["moving-cleaning"];
  const questions = new Map(config.step1Questions.map((question) => [question.key, question]));

  it("uses a three-person team and the approved fallback price", () => {
    expect(config.cleanerMode).toBe("team");
    expect(config.basePrice).toBe(1100);
    expect(config.pricePerExtraCleaner).toBe(0);
  });

  it("asks the approved move-specific questions", () => {
    expect([...questions.keys()]).toEqual([
      "propertyType",
      "moveType",
      "furnished",
      "bedrooms",
      "bathrooms",
      "extraRooms",
      "hasPets",
      "depositInspection",
    ]);
    expect(questions.get("extraRooms")?.required).toBe(true);
    expect(questions.get("furnished")?.showWhen).toBeUndefined();
    expect(questions.get("depositInspection")?.showWhen).toEqual({
      key: "moveType",
      values: ["move_out"],
    });
  });

  it("offers only approved optional add-ons", () => {
    expect(config.extras).toEqual([
      expect.objectContaining({ id: "appliances-cleaning", priceZar: 220 }),
      expect.objectContaining({ id: "inside-cabinets", priceZar: 180 }),
      expect.objectContaining({ id: "garage-cleaning", priceZar: 200 }),
    ]);
  });
});
