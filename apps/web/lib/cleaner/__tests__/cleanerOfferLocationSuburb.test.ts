import { describe, expect, it } from "vitest";
import { suburbFromLocationForOffer } from "@/lib/cleaner/cleanerOfferLocationSuburb";

describe("suburbFromLocationForOffer", () => {
  it("drops leading street segment when comma-separated", () => {
    expect(suburbFromLocationForOffer("12 Kloof St, Gardens, Cape Town")).toBe("Gardens, Cape Town");
  });

  it("returns area on file when empty", () => {
    expect(suburbFromLocationForOffer(null)).toBe("Area on file");
  });
});
