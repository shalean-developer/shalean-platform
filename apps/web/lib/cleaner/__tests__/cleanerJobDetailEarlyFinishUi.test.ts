import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("cleaner job detail early-finish UI", () => {
  const src = readFileSync(join(process.cwd(), "app/cleaner/jobs/[id]/page.tsx"), "utf8");

  it("surfaces the controlled early-finish request flow when completion is time-blocked", () => {
    expect(src).toContain("Finished early? Ask the customer to approve completion");
    expect(src).toContain("Why did the job finish early?");
    expect(src).toContain("Request customer approval");
    expect(src).toContain("/api/cleaner/jobs/${encodeURIComponent(id)}/early-finish");
  });

  it("keeps early-finish UI scoped to the completion gate", () => {
    expect(src).toContain("{completionGateBlocked ? (");
    expect(src).toContain("Customer approval requested. Once approved, refresh this job and complete it.");
  });
});
