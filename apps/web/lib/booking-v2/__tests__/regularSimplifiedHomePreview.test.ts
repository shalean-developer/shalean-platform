import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const shell = readFileSync(join(root, "src/features/booking-v2/BookingV2Shell.tsx"), "utf8");
const home = readFileSync(join(root, "src/features/booking-v2/steps/RegularSimplifiedHome.tsx"), "utf8");
const contract = readFileSync(join(root, "src/features/booking-v2/regularSimplifiedJourneyContract.ts"), "utf8");

describe("FCO-01-C2 isolated home preview contract", () => {
  it("only replaces Regular Cleaning Step 1 behind the fail-closed flag", () => {
    expect(shell).toContain("regularSimplifiedPreviewEnabled");
    expect(contract).toContain("NEXT_PUBLIC_FCO_01_REGULAR_HOME_PREVIEW");
    expect(shell).toContain('1: simplifiedHomePreview ? <RegularSimplifiedHome /> : <Step1Details />');
    expect(contract).toContain('input.environment !== "production"');
    expect(shell).toContain("shouldShowBookingShellNavigation");
  });

  it("keeps the existing schedule, review fallback, and payment components", () => {
    expect(shell).toContain("2: <Step2Schedule />");
    expect(shell).toContain("3: simplifiedHomePreview ? <RegularSimplifiedDetailsReview /> : <Step3Review />");
    expect(shell).toContain("4: <Step4Payment />");
  });

  it("preserves explicit equipment choice, suburb resolution and optional extras", () => {
    expect(home).toContain('name="regular-home-equipment-choice"');
    expect(home).toContain('setValue("equipmentQuote", null');
    expect(home).toContain("withActiveCleanersOnly=false");
    expect(home).toContain('setValue("serviceAreaLocationId"');
    expect(home).toContain('setValue("selectedExtras"');
    expect(home).toContain("regularHomeAnswersComplete");
  });

  it("does not present an unresolved logistics charge as a confirmed price", () => {
    expect(home).toContain("This is not a final price.");
    expect(home).toContain("before your full address is confirmed");
    expect(home).toContain("You can continue to see available dates.");
  });
});
