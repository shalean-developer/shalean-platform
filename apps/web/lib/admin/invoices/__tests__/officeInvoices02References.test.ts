import { describe, expect, it } from "vitest";
import { formatZohoOrderReference } from "@/lib/zoho/zohoOrderReference";

describe("OFFICE-INVOICES-02 invoice references", () => {
  it("uses stable MI references for monthly drafts", () => {
    expect(formatZohoOrderReference("24858229-8698-4aec-bb14-21475790d429", "monthly")).toBe("MI-24858229");
  });

  it("keeps the reference uppercase and short for operations", () => {
    expect(formatZohoOrderReference("abcdef12-8698-4aec-bb14-21475790d429", "monthly")).toBe("MI-ABCDEF12");
  });
});
