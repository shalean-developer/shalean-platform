import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const componentSource = readFileSync(
  new URL("./CleaningPricesCapeTownPage.tsx", import.meta.url),
  "utf8",
);
const routeSource = readFileSync(
  new URL("../../app/(marketing)/cleaning-prices-cape-town/page.tsx", import.meta.url),
  "utf8",
);

describe("RD-PUBLIC-04 cleaning prices page contract", () => {
  it("loads display prices from the booking catalogue", () => {
    expect(routeSource).toContain("loadBookingV2Catalog");
    expect(routeSource).toContain('bookingCatalog.catalog["regular-cleaning"].basePrice');
    expect(routeSource).toContain('bookingCatalog.catalog["carpet-cleaning"].basePrice');
    expect(routeSource).toContain("bookingCatalog.feesConfig.serviceFeeFlatCents / 100");
  });

  it("covers all six governed services from one pricing definition", () => {
    for (const key of ["standard", "deep", "move", "airbnb", "office", "carpet"]) {
      expect(componentSource).toContain(`key: "${key}"`);
    }
    expect(componentSource).toContain("pricingDisplay.services[tier.key]");
    expect(componentSource).toContain("buildPricingOfferCatalogNode(pageUrl, catalogId, tiers)");
  });

  it("keeps the service fee visible and removes stale duplicated price bands", () => {
    expect(componentSource).toContain("separately itemised R{pricingDisplay.serviceFeeZar} service fee");
    expect(componentSource).not.toContain("homeSizePricingBands");
    expect(componentSource).not.toContain("pricingComparisonRows");
    expect(componentSource).not.toContain("SeoInternalLinksBlock");
  });

  it("keeps one visible FAQ source aligned with FAQ schema", () => {
    expect(componentSource).toContain("CLEANING_PRICES_CAPE_TOWN_FAQS.map");
    expect(componentSource).toContain('id="faq"');
    expect(componentSource.match(/<section id="faq"/g)).toHaveLength(1);
  });
});
