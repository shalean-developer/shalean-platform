import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SERVICE_PRICING_CONTRACTS } from "@/lib/booking-v2/servicePricingContract";

const contextSource = readFileSync(
  join(process.cwd(), "src/features/booking-v2/BookingV2Context.tsx"),
  "utf8",
);
const reviewSource = readFileSync(
  join(process.cwd(), "src/features/booking-v2/steps/Step3Review.tsx"),
  "utf8",
);

describe("FINAL-SIX-CLOSEOUT", () => {
  it("invalidates stale schedules for Regular, Deep and Moving scope changes", () => {
    expect(contextSource).toContain("const prevCoreServiceScopeRef");
    expect(contextSource).toContain('"serviceDetails.bedrooms"');
    expect(contextSource).toContain('"serviceDetails.bathrooms"');
    expect(contextSource).toContain('"serviceDetails.extraRooms"');
    expect(contextSource).toContain('"serviceDetails.lastCleaned"');
    expect(contextSource).toContain('"serviceDetails.moveType"');
    expect(contextSource).toContain('"serviceDetails.furnished"');
    expect(contextSource).toContain('"selectedExtras"');
    expect(contextSource).toContain('form.setValue("time", ""');
    expect(contextSource).toContain('form.setValue("selectedCleanerIds", []');
    expect(contextSource).toContain('form.setValue("assignedTeamId", ""');
  });

  it("routes Regular, Deep and Moving Review edits to canonical Details/Schedule", () => {
    expect(reviewSource).toContain("const isCoreCloseoutService");
    expect(reviewSource).toContain("function editCoreDetails()");
    expect(reviewSource).toContain('editDetailsSection("property")');
    expect(reviewSource).toContain("function editCoreSchedule()");
    expect(reviewSource).toContain('editScheduleSection("booking_type")');
    expect(reviewSource).toContain("function editCoreCleaner()");
    expect(reviewSource).toContain('editScheduleSection("cleaner")');
    expect(reviewSource).toContain("function editCoreAddons()");
  });

  it("revalidates core Details, Schedule and live slot before Payment", () => {
    expect(contextSource).toContain('serviceSlug === "regular-cleaning"');
    expect(contextSource).toContain('serviceSlug === "deep-cleaning"');
    expect(contextSource).toContain('serviceSlug === "moving-cleaning"');
    expect(contextSource).toContain("bookingDetailsStageReady(");
    expect(contextSource).toContain("buildStep2Schema(scheduling).safeParse(values)");
    expect(contextSource).toContain("verifySelectedBookingV2Slot(verificationInput)");
    expect(contextSource).toContain("verifySelectedBookingV2Cleaners({");
  });

  it("keeps Moving property type informational with Moving-specific metadata", () => {
    const propertyType = SERVICE_PRICING_CONTRACTS["moving-cleaning"].fields.find(
      (field) => field.key === "propertyType",
    );
    expect(propertyType?.effect).toBe("informational");
    expect(propertyType?.consumedBy).toContain("Moving");
    expect(propertyType?.consumedBy).not.toContain("Airbnb");
  });
});
