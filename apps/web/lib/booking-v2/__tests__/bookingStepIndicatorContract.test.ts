import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  join(process.cwd(), "src/features/booking-v2/components/BookingV2StepIndicator.tsx"),
  "utf8",
);

describe("booking step indicator", () => {
  it("shows a checkmark instead of the number for completed steps", () => {
    expect(source).toContain('import { Check } from "lucide-react"');
    expect(source).toContain("isCompleted ? (");
    expect(source).toContain('<Check className="h-4 w-4" strokeWidth={3} aria-hidden />');
  });

  it("announces completed steps to assistive technology", () => {
    expect(source).toContain('isCompleted ? " completed" : ""');
    expect(source).toContain('aria-current={isActive ? "step" : undefined}');
  });
});
