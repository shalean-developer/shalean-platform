import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function read(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("P3-13 Review Funnel metric semantics", () => {
  it("keeps total reviews received separate from prompt-attributed conversion", () => {
    const loader = read("lib/admin/officeReviewFunnel.ts");
    expect(loader).toContain("reviewsReceived: number");
    expect(loader).toContain("promptedReviewsSubmitted: number");
    expect(loader).toContain('.select("id", { count: "exact", head: true })');
    expect(loader).toContain("const reviewsReceived = reviewsCountRes.count ?? 0");
    expect(loader).toContain("Could not count reviews received");
    expect(loader).toContain("Could not resolve recent review-request outcomes");
    expect(loader).toContain("reviewsReceived,");
    expect(loader).toContain("promptedReviewsSubmitted: funnel.reviewsSubmitted");
  });

  it("renders Reviews received from actual review rows, not attributed conversions", () => {
    const page = read("app/(ui-redesign)/office/review-funnel/page.tsx");
    expect(page).toContain('value: data.reviewsReceived');
    expect(page).toContain('value: data?.reviewsReceived ?? "—"');
    expect(page).toContain("Prompt-attributed reviews:");
    expect(page).toContain("Reviews received = all reviews created in the selected window.");
  });
});
