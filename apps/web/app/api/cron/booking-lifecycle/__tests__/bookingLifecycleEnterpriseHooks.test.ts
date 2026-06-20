import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("booking-lifecycle cron enterprise hooks (static guard)", () => {
  const routePath = join(process.cwd(), "app/api/cron/booking-lifecycle/route.ts");

  it("evaluates lifecycle email alerts after cron run", () => {
    const src = readFileSync(routePath, "utf8");
    expect(src).toContain("evaluateLifecycleEmailAlerts");
  });
});
