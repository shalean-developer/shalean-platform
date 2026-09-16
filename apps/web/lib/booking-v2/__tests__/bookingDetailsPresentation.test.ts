import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  join(process.cwd(), "src/features/booking-v2/steps/Step1Details.tsx"),
  "utf8",
);

describe("booking details presentation", () => {
  it("does not render the redundant About the clean heading", () => {
    expect(source).not.toMatch(/About the clean/i);
  });
});
