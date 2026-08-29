import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../../../../..");
const page = readFileSync(resolve(root, "app/(ui-redesign)/office/cleaner-performance/page.tsx"), "utf8");

const scorecardHeaders = [
  "Cleaner",
  "Overall",
  "QA",
  "Reviews",
  "Reliability",
  "Completion",
  "Attendance",
  "Evidence",
  "Quality cases",
];

describe("SR-11J Office cleaner performance table shell contract", () => {
  it("uses the shared Office table shell", () => {
    expect(page).toContain("OfficeZohoTableShell");
    expect(page).toContain("<OfficeZohoTableShell>");
    expect(page).toContain("</OfficeZohoTableShell>");
  });

  it("preserves cleaner scorecard table content and API behavior", () => {
    expect(page).toContain("/api/admin/cleaner-performance?days=${days}");
    expect(page).toContain("Cleaner scorecards");
    expect(page).toContain("Loading scorecards…");
    expect(page).toContain("No cleaners found.");
    for (const header of scorecardHeaders) expect(page).toContain(`>${header}<`);
  });

  it("does not introduce finance amount headers into this read-only table", () => {
    expect(page).not.toContain(">Amount<");
    expect(page).not.toContain(">Customer amount<");
    expect(page).not.toContain(">Customer revenue<");
  });
});
