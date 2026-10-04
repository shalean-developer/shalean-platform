import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { bookingDetailsStageReady } from "@/src/features/booking-v2/steps/serviceProgressiveDisclosure";

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

describe("BOOKING-E2E-14C Moving condition defaults", () => {
  it("treats canonical no/no Moving condition answers as complete", () => {
    expect(
      bookingDetailsStageReady(
        "moving-cleaning",
        "condition",
        {
          furnished: "no",
          hasPets: "no",
        },
        {},
      ),
    ).toBe(true);
  });

  it("still blocks Moving condition when furnished is actually missing", () => {
    expect(
      bookingDetailsStageReady(
        "moving-cleaning",
        "condition",
        {
          hasPets: "no",
        },
        {},
      ),
    ).toBe(false);
  });

  it("persists the visible unchecked No state into form data", () => {
    const src = read("src/features/booking-v2/components/ServiceQuestionOptionCards.tsx");

    expect(src).toContain('setValue(fieldKey, "no"');
    expect(src).toContain("shouldValidate: true");
    expect(src).toContain("clearErrors(fieldKey)");
  });

  it("propagates explicit yes/no toggle changes back to progressive booking state", () => {
    const src = read("src/features/booking-v2/components/ServiceQuestionOptionCards.tsx");

    expect(src).toContain('const value = next ? "yes" : "no"');
    expect(src).toContain("onValueChange?.(value)");
  });
});
