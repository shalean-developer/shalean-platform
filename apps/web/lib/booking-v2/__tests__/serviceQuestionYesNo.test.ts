import { describe, expect, it } from "vitest";
import {
  coerceYesNoValue,
  isYesNoAnswered,
  validateYesNoRequired,
} from "@/src/features/booking-v2/components/serviceQuestionYesNo";

describe("serviceQuestionYesNo", () => {
  it("coerces legacy and empty values to yes/no", () => {
    expect(coerceYesNoValue("yes")).toBe("yes");
    expect(coerceYesNoValue("no")).toBe("no");
    expect(coerceYesNoValue(true)).toBe("yes");
    expect(coerceYesNoValue(false)).toBe("no");
    expect(coerceYesNoValue("")).toBe("no");
    expect(coerceYesNoValue(null)).toBe("no");
    expect(coerceYesNoValue(undefined)).toBe("no");
  });

  it("detects answered yes/no values", () => {
    expect(isYesNoAnswered("yes")).toBe(true);
    expect(isYesNoAnswered("no")).toBe(true);
    expect(isYesNoAnswered(true)).toBe(true);
    expect(isYesNoAnswered(false)).toBe(true);
    expect(isYesNoAnswered("")).toBe(false);
    expect(isYesNoAnswered(null)).toBe(false);
  });

  it("validates required yes/no fields", () => {
    expect(validateYesNoRequired("no", "Pets")).toBe(true);
    expect(validateYesNoRequired(false, "Pets")).toBe(true);
    expect(validateYesNoRequired("", "Pets")).toBe("Pets is required");
  });
});
