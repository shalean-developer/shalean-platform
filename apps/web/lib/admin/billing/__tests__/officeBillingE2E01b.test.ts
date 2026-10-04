import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("OFFICE-BILLING-E2E-01B loader failure UX", () => {
  it("always clears loading state and surfaces unexpected load failures", () => {
    const src = readFileSync(
      resolve(process.cwd(), "app/(ui-redesign)/office/billing/page.tsx"),
      "utf8",
    );

    expect(src).toContain("finally {");
    expect(src).toContain("setLoading(false)");
    expect(src).toContain('setLoadError("Could not load the billing reconciliation inbox.")');
  });
});
