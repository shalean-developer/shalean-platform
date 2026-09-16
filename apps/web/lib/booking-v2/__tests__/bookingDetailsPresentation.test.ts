import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  join(process.cwd(), "src/features/booking-v2/steps/Step1Details.tsx"),
  "utf8",
);
const addressSource = readFileSync(
  join(process.cwd(), "src/features/booking-v2/components/PropertyAddressSection.tsx"),
  "utf8",
);

describe("booking details presentation", () => {
  it("does not render the redundant About the clean heading", () => {
    expect(source).not.toMatch(/About the clean/i);
  });

  it("keeps property type visible with rooms and auto-advances optional choice stages", () => {
    expect(source).toContain(
      'activeDetailsStage === "property" || activeDetailsStage === "rooms"',
    );
    expect(source).toContain('activeDetailsStage === "pets";');
    expect(source).toContain("{!autoAdvanceStage ? (");
  });

  it("places contact phone beside suburb and street address on the full-width row", () => {
    const customAddressGrid = addressSource.slice(
      addressSource.indexOf('<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">'),
    );
    expect(customAddressGrid.indexOf('htmlFor="contactPhone"')).toBeLessThan(
      customAddressGrid.indexOf('htmlFor="suburb"'),
    );
    expect(customAddressGrid).toContain(
      '<div className="min-w-0 sm:col-span-2">\n              <FieldLabel htmlFor="address" required>',
    );
  });
});
