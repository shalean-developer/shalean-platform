import { describe, expect, it } from "vitest";

import { formatZohoOrderReference, shortShaleanId } from "@/lib/zoho/zohoOrderReference";

describe("zohoOrderReference", () => {
  it("shortShaleanId matches office display", () => {
    expect(shortShaleanId("c44bd9d4-9518-4a2b-9c1d-abcdef123456")).toBe("C44BD9D4");
  });

  it("formatZohoOrderReference prefixes booking and monthly", () => {
    const id = "c44bd9d4-9518-4a2b-9c1d-abcdef123456";
    expect(formatZohoOrderReference(id, "booking")).toBe("BK-C44BD9D4");
    expect(formatZohoOrderReference(id, "monthly")).toBe("MI-C44BD9D4");
  });
});
