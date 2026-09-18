import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const routeSource = readFileSync(
  new URL("../../../app/api/admin/my-work/route.ts", import.meta.url),
  "utf8",
);

describe("admin My Work route export contract", () => {
  it("exports only fields supported by a Next.js route module", () => {
    const exportedNames = [
      ...routeSource.matchAll(/export\s+(?:async\s+)?(?:const|function)\s+([A-Za-z_$][\w$]*)/g),
    ].map((match) => match[1]);

    expect(exportedNames.sort()).toEqual(["GET", "dynamic", "runtime"]);
  });

  it("keeps allocation and cron helpers private to the route", () => {
    expect(routeSource).toContain("function bookingNeedsAllocationWork(");
    expect(routeSource).toContain("function cronStaleAfterMs(");
    expect(routeSource).toContain("function cronJobIsStale(");
    expect(routeSource).not.toMatch(
      /export\s+function\s+(?:bookingNeedsAllocationWork|cronStaleAfterMs|cronJobIsStale)/,
    );
  });
});
