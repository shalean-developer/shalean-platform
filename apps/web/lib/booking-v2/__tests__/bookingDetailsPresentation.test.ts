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
const roomCountSource = readFileSync(
  join(process.cwd(), "src/features/booking-v2/components/RoomCountSelector.tsx"),
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

  it("uses Continue as the only way to leave the rooms and pets stages", () => {
    expect(source).toContain('const autoAdvanceStage = activeDetailsStage === "property";');
    expect(source).toContain('disabled={!regularStageReady}');
    expect(source).toContain('onClick={() => moveRegularStage("next")}');
  });

  it("places the equipment delivery question with pets and keeps extras separate", () => {
    expect(source).toContain(
      'const showEquipmentQuestion = !isRegularCleaning || activeDetailsStage === "pets";',
    );
    expect(source).toContain(
      'const showExtras = !isRegularCleaning || activeDetailsStage === "equipment";',
    );
    expect(source).toContain('<div className={cn(!showEquipmentQuestion && "hidden")}>');
    expect(source).toContain('{showExtras && extras.length > 0 && (');
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

  it("uses an accessible bounded stepper for exact custom room counts", () => {
    expect(roomCountSource).toContain('onClick={() => adjustDraft(-1)}');
    expect(roomCountSource).toContain('onClick={() => adjustDraft(1)}');
    expect(roomCountSource).toContain('aria-label="Decrease count"');
    expect(roomCountSource).toContain('aria-label="Increase count"');
    expect(roomCountSource).toContain('Math.min(25, Math.max(customMinimum');
    expect(roomCountSource).not.toContain('type="number"');
  });

  it("uses the branded accessible dropdown for saved properties", () => {
    expect(addressSource).toContain("function SavedPropertySelect");
    expect(addressSource).toContain('aria-haspopup="listbox"');
    expect(addressSource).toContain('role="listbox"');
    expect(addressSource).toContain('role="option"');
    expect(addressSource).toContain('event.key === "Escape"');
    expect(addressSource).not.toContain('<select\n                id="saved-property"');
  });

  it("makes a saved property immediately ready for one-click continuation", () => {
    expect(addressSource).toContain("const savedLocation =");
    expect(addressSource).toContain('setValue("serviceAreaLocationId", savedLocation?.id ?? ""');
    expect(addressSource).toContain('setValue("serviceAreaCityId", savedLocation?.city_id ?? ""');
    expect(addressSource).toContain("[locationOptions, setValue]");
  });
});
