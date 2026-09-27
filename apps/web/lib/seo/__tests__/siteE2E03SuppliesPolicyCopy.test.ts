import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const files = [
  "components/home/sections/FAQSection.tsx",
  "lib/faq/faq-page-data.ts",
  "lib/seo/location-dynamic-faqs.ts",
  "lib/seo/location-paa-faqs.ts",
  "lib/seo/cleaningServicesCapeTownHub.ts",
  "lib/services/servicesHubFaqs.ts",
].map((relativePath) => ({
  relativePath,
  source: readFileSync(join(process.cwd(), relativePath), "utf8"),
}));

describe("SITE-E2E-03 supplies policy copy", () => {
  it("does not claim supplies are universally included in shared FAQ/SEO copy", () => {
    const forbidden = [
      "Yes. Teams arrive with professional-grade products and equipment.",
      "Supplies are included on standard Shalean visits",
      "Yes. Teams arrive with the products and equipment needed for the booked checklist.",
      "Yes—teams arrive with professional-grade products and equipment suited to typical",
    ];

    for (const { relativePath, source } of files) {
      for (const phrase of forbidden) {
        expect(source, relativePath).not.toContain(phrase);
      }
    }
  });

  it("states the service-specific policy in customer-facing shared copy", () => {
    const combined = files.map((file) => file.source).join("\n");
    expect(combined).toContain("Deep Cleaning and Move In / Out Cleaning include");
    expect(combined).toContain("Regular home cleaning and Airbnb Cleaning");
    expect(combined).toContain("customers provide");
    expect(combined).toContain("Office and specialist services");
  });

  it("keeps the Standard/Regular service page policy as the booking authority", () => {
    const serviceSeo = readFileSync(join(process.cwd(), "lib/seo/capeTownSeoPages.ts"), "utf8");
    expect(serviceSeo).toContain(
      "For standard cleaning, the customer provides suitable products and equipment by default.",
    );
    expect(serviceSeo).toContain("select the available paid option during booking");
  });
});
