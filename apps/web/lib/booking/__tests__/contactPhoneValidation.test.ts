import { describe, expect, it } from "vitest";
import { isValidContactPhone } from "@/lib/booking/contactPhoneValidation";

describe("isValidContactPhone", () => {
  it("accepts local SA 10-digit numbers", () => {
    expect(isValidContactPhone("0821234567")).toBe(true);
    expect(isValidContactPhone("082 123 4567")).toBe(true);
  });

  it("accepts international +27 format", () => {
    expect(isValidContactPhone("+27825915525")).toBe(true);
    expect(isValidContactPhone("+27 82 591 5525")).toBe(true);
  });

  it("rejects too few digits", () => {
    expect(isValidContactPhone("12345")).toBe(false);
    expect(isValidContactPhone("")).toBe(false);
  });

  it("rejects invalid characters", () => {
    expect(isValidContactPhone("call-me")).toBe(false);
  });
});
