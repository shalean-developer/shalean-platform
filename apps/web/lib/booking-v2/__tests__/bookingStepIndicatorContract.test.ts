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
    expect(source).toContain('<Check className="h-4 w-4" strokeWidth={2.5} aria-hidden />');
  });

  it("announces completed steps to assistive technology", () => {
    expect(source).toContain('isCompleted ? " completed" : ""');
    expect(source).toContain('aria-current={isActive ? "step" : undefined}');
  });

  it("uses Shalean branding for completed progress and a strong current-step state", () => {
    expect(source).toContain("const completedProgress =");
    expect(source).toContain('className="block h-full bg-primary');
    expect(source).toContain('isCompleted && "bg-primary text-primary-foreground');
    expect(source).toContain('isActive && "bg-slate-950 text-white"');
  });

  it("keeps step circles compact beside the logo and account control", () => {
    expect(source).toContain('"flex h-8 w-8 items-center');
    expect(source).toContain('top-4 h-px');
  });
});
