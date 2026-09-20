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
const reviewSource = readFileSync(
  join(process.cwd(), "src/features/booking-v2/steps/Step3Review.tsx"),
  "utf8",
);
const shellSource = readFileSync(
  join(process.cwd(), "src/features/booking-v2/BookingV2Shell.tsx"),
  "utf8",
);

describe("booking details presentation", () => {
  it("does not render the redundant About the clean heading", () => {
    expect(source).not.toMatch(/About the clean/i);
  });

  it("uses the shared progressive framework for service-specific stage visibility", () => {
    expect(source).toContain("bookingDetailsQuestionVisibleAtStage");
    expect(source).toContain("bookingDetailsStageAutoAdvances");
    expect(source).toContain("{!autoAdvanceStage ? (");
  });

  it("uses Continue as the only way to leave button-controlled detail stages", () => {
    expect(source).toContain("bookingDetailsStageAutoAdvances(serviceSlug, activeDetailsStage)");
    expect(source).toContain("disabled={!detailsStageReady}");
    expect(source).toContain('onClick={() => moveProgressiveStage("next")}');
  });

  it("keeps Regular equipment with pets while extras use the service final stage", () => {
    expect(source).toContain(
      'const showEquipmentQuestion = isRegularCleaning && activeDetailsStage === "pets";',
    );
    expect(source).toContain("bookingDetailsShowsExtras(serviceSlug, activeDetailsStage)");
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

  it("keeps cleaner preference and add-ons side by side without narrowing cleaner summaries", () => {
    expect(reviewSource).toContain(
      'title="Cleaner preference"\n              onEdit={() => openEdit("cleaner")}\n            >',
    );
    expect(reviewSource).toContain('<div className="grid grid-cols-1 gap-2.5">');
    expect(reviewSource).not.toContain('cleanerDetails.length > 1 && "md:grid-cols-2"');
    expect(reviewSource).toContain(
      'className="break-words text-sm font-semibold leading-snug text-slate-900"',
    );
    expect(reviewSource).not.toContain(
      'className="w-full truncate text-sm font-semibold leading-snug text-slate-900"',
    );
  });

  it("centres review and payment while preserving the sidebar offset on earlier steps", () => {
    expect(shellSource).toContain(
      'showSidebarSummary ? "lg:translate-x-6 xl:translate-x-20" : "mx-auto"',
    );
    expect(shellSource).not.toContain(
      'currentStep === 4 ? "mx-auto" : "lg:translate-x-6 xl:translate-x-20"',
    );
  });
});
