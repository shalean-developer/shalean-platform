import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const publicLabelFiles = [
  "lib/marketing/marketingServiceNavLinks.ts",
  "lib/booking/widgetServiceGroups.ts",
  "components/home/sections/ServicesSection.tsx",
  "components/booking/serviceCategories.ts",
  "lib/pricing/usePricingCatalog.ts",
  "app/services/page.tsx",
  "components/locations/cape-town-cleaning-services/ServicesGrid.tsx",
  "components/marketing-pricing/CleaningPricesCapeTownPage.tsx",
  "components/seo/ServicePageCommercialIntentSection.tsx",
  "components/quote/QuoteRequestCatalogPicker.tsx",
  "lib/faq/faq-page-data.ts",
].map((relativePath) => ({
  relativePath,
  source: readFileSync(join(process.cwd(), relativePath), "utf8"),
}));

describe("SITE-E2E-04 Regular Cleaning naming convergence", () => {
  it("uses Regular Cleaning on primary customer-facing service labels", () => {
    const combined = publicLabelFiles.map((file) => file.source).join("\n");
    expect(combined).toContain("Regular Cleaning");
    expect(combined).toContain("Regular cleaning");
    expect(combined).not.toContain('label: "Standard Cleaning"');
    expect(combined).not.toContain('title: "Standard Cleaning"');
    expect(combined).not.toContain('name: "Standard Cleaning"');
  });

  it("keeps internal compatibility keys and the established SEO URL unchanged", () => {
    const categories = readFileSync(join(process.cwd(), "components/booking/serviceCategories.ts"), "utf8");
    const nav = readFileSync(join(process.cwd(), "lib/marketing/marketingServiceNavLinks.ts"), "utf8");
    expect(categories).toContain('standard_cleaning: "Regular Cleaning"');
    expect(categories).toContain('id: "standard"');
    expect(nav).toContain('href: "/services/standard-cleaning-cape-town"');
  });

  it("uses Regular Cleaning in admin fallbacks while retaining standard database slugs", () => {
    const budget = readFileSync(join(process.cwd(), "lib/admin/expenses/budgetServiceOptions.ts"), "utf8");
    const recurring = readFileSync(join(process.cwd(), "app/(ui-redesign)/office/recurring/page.tsx"), "utf8");
    expect(budget).toContain('{ slug: "standard", label: "Regular cleaning" }');
    expect(recurring).toContain('plan.service_label ?? "Regular Cleaning"');
  });
});
