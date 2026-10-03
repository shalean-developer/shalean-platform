import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const routes = [
  "app/api/cleaner/jobs/route.ts",
  "app/api/cleaner/dashboard/route.ts",
  "app/api/cleaner/jobs/[id]/route.ts",
];

describe("cleaner read routes do not schedule earnings repair", () => {
  for (const route of routes) {
    it(`${route} keeps stuck-earnings handling diagnostic-only`, () => {
      const source = readFileSync(join(process.cwd(), route), "utf8");
      expect(source).not.toContain("scheduleStuckEarningsRecomputeDebounced");
      expect(source).toContain("maybeLogStuckNullEarnings");
    });
  }
});
