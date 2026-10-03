import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const quotePage = readFileSync(join(root, "app/(marketing)/quote/page.tsx"), "utf8");

describe("QUOTE-SEO-01 lead-intent page", () => {
  it("targets Cape Town cleaning quote intent in metadata and H1", () => {
    expect(quotePage).toContain("Free Cleaning Quote Cape Town | Shalean Cleaning Services");
    expect(quotePage).toContain("Get a cleaning quote in Cape Town");
    expect(quotePage).toContain('alternates: { canonical: CANONICAL }');
    expect(quotePage).toContain("SEO_INDEX_FOLLOW");
  });

  it("links to all six canonical service pages", () => {
    for (const href of [
      "/services/standard-cleaning-cape-town",
      "/services/deep-cleaning-cape-town",
      "/services/move-out-cleaning-cape-town",
      "/services/office-cleaning-cape-town",
      "/services/airbnb-cleaning-cape-town",
      "/services/carpet-cleaning-cape-town",
    ]) {
      expect(quotePage).toContain(href);
    }
  });

  it("keeps compact SEO content below the conversion form and exposes matching FAQ schema", () => {
    expect(quotePage.indexOf("<QuoteRequestForm />")).toBeLessThan(
      quotePage.indexOf('aria-labelledby="quote-services-heading"'),
    );
    expect(quotePage).toContain('"@type": "FAQPage"');
    expect(quotePage).toContain("Cleaning quotes for Cape Town");
    expect(quotePage).toContain("Common cleaning quote questions");
    expect(quotePage).toContain("View cleaning prices →");
    expect(quotePage).toContain("/cleaning-prices-cape-town");
    expect(quotePage).not.toContain("Maintenance and once-off home cleaning.");
    expect((quotePage.match(/question:/g) ?? []).length).toBe(3);
  });
});
