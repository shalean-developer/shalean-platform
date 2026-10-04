import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const faqPage = readFileSync(join(process.cwd(), "lib/faq/faq-page-data.ts"), "utf8");
const servicesHub = readFileSync(join(process.cwd(), "lib/services/servicesHubFaqs.ts"), "utf8");

describe("SITE-E2E-05 FAQ pricing guidance", () => {
  it("removes the stale R300-R900 blanket range", () => {
    expect(faqPage).not.toContain("R300 and R900");
    expect(servicesHub).not.toContain("R300 and R900");
  });

  it("publishes the governed current base-price anchors", () => {
    for (const source of [faqPage, servicesHub]) {
      expect(source).toContain("R250 for Regular Cleaning and Airbnb Cleaning");
      expect(source).toContain("R300 for Office Cleaning");
      expect(source).toContain("R500 for Carpet Cleaning");
      expect(source).toContain("R1,200 for Deep Cleaning or Move In / Out Cleaning");
    }
  });

  it("keeps the live booking flow as the final pricing authority", () => {
    expect(faqPage).toContain("live booking flow as the pricing authority");
    expect(servicesHub).toContain("use the booking flow for the live price before checkout");
  });
});
