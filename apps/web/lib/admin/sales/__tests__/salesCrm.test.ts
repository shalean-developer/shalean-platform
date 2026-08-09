import { describe, expect, it } from "vitest";

import { isSalesCrmActivityType, isSalesCrmStage, normalizedCrmText, opportunityRootId, parseOptionalCrmDate } from "../salesCrm";

describe("sales CRM controls", () => {
  it("accepts only supported controlled stages and activity types", () => {
    expect(isSalesCrmStage("qualified")).toBe(true);
    expect(isSalesCrmStage("paid")).toBe(false);
    expect(isSalesCrmActivityType("whatsapp")).toBe(true);
    expect(isSalesCrmActivityType("stage_change")).toBe(false);
  });

  it("always writes CRM state to the root quote opportunity", () => {
    expect(opportunityRootId({ id: "invoice", converted_from_id: "quote" })).toBe("quote");
    expect(opportunityRootId({ id: "quote", converted_from_id: null })).toBe("quote");
  });

  it("normalizes text and dates at the API boundary", () => {
    expect(normalizedCrmText("  called back  ")).toBe("called back");
    expect(normalizedCrmText("   ")).toBeNull();
    expect(parseOptionalCrmDate("not-a-date")).toBeUndefined();
    expect(parseOptionalCrmDate("")).toBeNull();
    expect(parseOptionalCrmDate("2026-08-10T12:00:00+02:00")).toBe("2026-08-10T10:00:00.000Z");
  });
});
