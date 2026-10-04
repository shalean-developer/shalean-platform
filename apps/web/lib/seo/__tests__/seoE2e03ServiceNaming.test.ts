import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  getBookingSummaryServiceLabel,
  getServiceLabel,
  inferServiceTypeFromServiceId,
} from "@/components/booking/serviceCategories";
import { widgetServiceLabel } from "@/lib/booking/widgetServiceGroups";
import {
  MARKETING_FOOTER_SERVICE_LINKS,
  MARKETING_SERVICE_NAV_LINKS,
} from "@/lib/marketing/marketingServiceNavLinks";
import { buildMarketingHomeServiceCards } from "@/lib/marketing/marketingHomeServicePresentation";
import {
  buildCapeTownServiceMetadata,
  CAPE_TOWN_SERVICE_SCHEMA_SERVICE_TYPE,
  CAPE_TOWN_SERVICE_SEO,
} from "@/lib/seo/capeTownSeoPages";
import { KEYWORD_PRIMARY_ROUTE } from "@/lib/seo/keyword-primary-route";
import { serviceTitleBaseForCtr } from "@/lib/seo/metaTitle";
import {
  REGULAR_CLEANING_PUBLIC_NAME,
  REGULAR_CLEANING_SECONDARY_KEYWORD,
  REGULAR_CLEANING_SERVICE_PATH,
} from "@/lib/services/publicServiceNames";
import { PUBLIC_SERVICE_LABELS } from "@/lib/services/publicServiceExtras";

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

describe("SEO-E2E-03 service naming convergence", () => {
  it("uses Regular Cleaning as the customer-facing booking identity", () => {
    expect(REGULAR_CLEANING_PUBLIC_NAME).toBe("Regular Cleaning");
    expect(getServiceLabel("standard")).toBe(REGULAR_CLEANING_PUBLIC_NAME);
    expect(
      getBookingSummaryServiceLabel(
        "standard",
        inferServiceTypeFromServiceId("standard"),
      ),
    ).toBe(REGULAR_CLEANING_PUBLIC_NAME);
    expect(widgetServiceLabel("standard")).toBe(REGULAR_CLEANING_PUBLIC_NAME);
  });

  it("uses Regular Cleaning across homepage, header and footer service navigation", () => {
    expect(buildMarketingHomeServiceCards([])[0]).toMatchObject({
      id: "standard",
      title: REGULAR_CLEANING_PUBLIC_NAME,
      href: REGULAR_CLEANING_SERVICE_PATH,
    });
    expect(MARKETING_SERVICE_NAV_LINKS[0]).toEqual({
      label: REGULAR_CLEANING_PUBLIC_NAME,
      href: REGULAR_CLEANING_SERVICE_PATH,
    });
    expect(MARKETING_FOOTER_SERVICE_LINKS[0]).toEqual({
      label: REGULAR_CLEANING_PUBLIC_NAME,
      href: REGULAR_CLEANING_SERVICE_PATH,
    });
    expect(PUBLIC_SERVICE_LABELS["regular-cleaning"]).toBe(REGULAR_CLEANING_PUBLIC_NAME);
  });

  it("keeps the canonical service URL stable while making Regular Cleaning primary in SEO", () => {
    const block = CAPE_TOWN_SERVICE_SEO["standard-cleaning-cape-town"];
    const metadata = buildCapeTownServiceMetadata(block);

    expect(block.path).toBe(REGULAR_CLEANING_SERVICE_PATH);
    expect(block.h1).toContain("Regular");
    expect(block.bookingLabel).toBe("regular cleaning");
    expect(block.description).toContain(REGULAR_CLEANING_PUBLIC_NAME);
    expect(block.description.toLowerCase()).toContain(REGULAR_CLEANING_SECONDARY_KEYWORD);
    expect(CAPE_TOWN_SERVICE_SCHEMA_SERVICE_TYPE["standard-cleaning-cape-town"]).toBe(
      "Regular Home Cleaning Service",
    );
    expect(serviceTitleBaseForCtr(block.bookingLabel, block.slug)).toBe(
      REGULAR_CLEANING_PUBLIC_NAME,
    );
    expect(String(metadata.title)).toContain(REGULAR_CLEANING_PUBLIC_NAME);
    expect(String(metadata.description).toLowerCase()).toContain(
      REGULAR_CLEANING_SECONDARY_KEYWORD,
    );
    expect(String(metadata.description)).not.toContain("…");
    expect(String(metadata.description)).not.toMatch(/\.\.\.$/);
  });

  it("preserves standard-cleaning search intent and technical compatibility identifiers", () => {
    expect(KEYWORD_PRIMARY_ROUTE["standard cleaning cape town"]).toBe(
      REGULAR_CLEANING_SERVICE_PATH,
    );
    expect(REGULAR_CLEANING_SERVICE_PATH).toBe("/services/standard-cleaning-cape-town");
  });

  it("does not reintroduce Standard Cleaning as a primary public label in core surfaces", () => {
    const core = [
      "app/services/page.tsx",
      "components/booking/serviceCategories.ts",
      "lib/booking/widgetServiceGroups.ts",
      "lib/marketing/marketingServiceNavLinks.ts",
      "lib/marketing/marketingHomeServicePresentation.ts",
      "components/seo/LocationHubQueryExpansion.tsx",
      "components/seo/LocationHubRankingSections.tsx",
      "components/seo/ProgrammaticLocationCleaningPage.tsx",
      "components/seo/StandardCleaningCapeTownEnhancements.tsx",
      "components/services/PrimaryCapeTownServiceExtensions.tsx",
      "lib/services/publicServiceExtras.ts",
    ].map(read).join("\n");

    expect(core).not.toContain("Standard Cleaning");
    expect(core).not.toContain("Standard cleaning");
    expect(core).toContain("Regular Cleaning");
  });
});
