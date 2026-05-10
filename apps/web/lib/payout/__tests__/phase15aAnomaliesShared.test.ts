import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { PHASE15A_UI_COPY } from "@/lib/payout/phase15aAnomaliesShared";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const diagnosticsPagePath = path.join(
  __dirname,
  "../../../app/admin/payouts/phase15a-diagnostics/page.tsx",
);

describe("Phase15A Week 2 UI copy", () => {
  it("exports the required measurement-only banner text", () => {
    expect(PHASE15A_UI_COPY.banner).toBe(
      "Phase 15A measurement only. These findings do not block payouts yet.",
    );
  });

  it("renders measurement-only language on the diagnostics page source", () => {
    const src = readFileSync(diagnosticsPagePath, "utf8");
    expect(src).toContain("{PHASE15A_UI_COPY.banner}");
    expect(src).toContain("{PHASE15A_UI_COPY.classificationAdvisory}");
    expect(src).toContain("data-testid=\"phase15a-measurement-banner\"");
    expect(src).toContain("data-testid=\"phase15a-measurement-badge\"");
    expect(src).toContain("data-testid=\"phase15a-classification-advisory\"");
  });
});
