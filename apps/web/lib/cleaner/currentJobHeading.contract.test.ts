import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function read(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

describe("cleaner dashboard current-job headings", () => {
  it("labels an in-progress NextJobCard as Current job", () => {
    const source = read("components/cleaner/NextJobCard.tsx");

    expect(source).toContain('const cardHeading = inProgress ? "Current job" : "Next job";');
    expect(source).toContain("{cardHeading}");
  });

  it("labels an in-progress active-job hero as Current job", () => {
    const source = read("components/cleaner-dashboard/ActiveJobHero.tsx");

    expect(source).toContain('const heroLabel = chipLabel === "In progress" ? "Current job" : "Active job";');
    expect(source).toContain('aria-label={heroLabel}');
    expect(source).toContain("{heroLabel}");
  });
});
