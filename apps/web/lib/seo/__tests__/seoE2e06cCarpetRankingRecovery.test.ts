import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildCapeTownServiceMetadata,
  CAPE_TOWN_SERVICE_SEO,
  resolveCapeTownServiceSchemaFields,
} from "@/lib/seo/capeTownSeoPages";
import {
  getBlogAboveFoldServiceLink,
  getBlogIntentServicePair,
  getLocationHubRelatedServiceLinks,
} from "@/lib/seo/internalLinks";
import { KEYWORD_PRIMARY_ROUTE } from "@/lib/seo/keyword-primary-route";

const CARPET_PATH = "/services/carpet-cleaning-cape-town";

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

describe("SEO-E2E-06C Carpet Cleaning ranking recovery", () => {
  it("assigns the core Carpet Cleaning queries to the canonical service page", () => {
    expect(KEYWORD_PRIMARY_ROUTE["carpet cleaning cape town"]).toBe(CARPET_PATH);
    expect(KEYWORD_PRIMARY_ROUTE["carpet cleaning services cape town"]).toBe(CARPET_PATH);
  });

  it("aligns rendered metadata, H1, keywords and schema around Carpet Cleaning Cape Town", () => {
    const block = CAPE_TOWN_SERVICE_SEO["carpet-cleaning-cape-town"];
    const metadata = buildCapeTownServiceMetadata(block);
    const schema = resolveCapeTownServiceSchemaFields(block.slug, block);

    expect(block.path).toBe(CARPET_PATH);
    expect(String(metadata.title)).toBe("Carpet Cleaning Cape Town | Shalean");
    expect(block.h1.toLowerCase()).toContain("carpet cleaning services in cape town");
    expect(String(metadata.description).toLowerCase()).toContain("professional carpet cleaning in cape town");
    expect(block.keywords).toContain("carpet cleaning cape town");
    expect(block.keywords).toContain("carpet cleaning services cape town");
    expect(schema.schemaName).toBe("Carpet Cleaning Cape Town | Shalean");
    expect(schema.schemaServiceType).toBe("Carpet Cleaning Service");
  });

  it("uses Carpet Cleaning Services anchors on relevant internal-link surfaces", () => {
    const locationLinks = getLocationHubRelatedServiceLinks(
      "Claremont",
      "claremont-cleaning-services",
    );
    const carpetLocationLink = locationLinks.find((link) => link.href === CARPET_PATH);
    expect(carpetLocationLink?.anchor.toLowerCase()).toContain("carpet cleaning services");

    const aboveFold = getBlogAboveFoldServiceLink("carpet-cleaning-guide-cape-town");
    expect(aboveFold.href).toBe(CARPET_PATH);
    expect(aboveFold.anchor.toLowerCase()).toContain("carpet cleaning services");

    const pair = getBlogIntentServicePair("carpet", "carpet-care-guide");
    expect(pair[0]?.href).toBe(CARPET_PATH);
    expect(pair[0]?.anchor.toLowerCase()).toContain("carpet cleaning services");
  });

  it("adds unique carpet scope, preparation, stain and drying guidance", () => {
    const extension = read("components/services/PrimaryCapeTownServiceExtensions.tsx");

    expect(extension).toContain("CarpetAfterIncluded");
    expect(extension).toContain("Carpet cleaning in Cape Town: scope, preparation and drying");
    expect(extension).toContain("permanent dye");
    expect(extension).toContain("Cape Town humidity");
    expect(extension).toContain("afterIncluded: <CarpetAfterIncluded />");
  });

  it("does not move Carpet Cleaning ownership to another route", () => {
    expect(KEYWORD_PRIMARY_ROUTE["carpet cleaning cape town"]).not.toBe("/");
    expect(KEYWORD_PRIMARY_ROUTE["carpet cleaning cape town"]).not.toBe("/services");
  });
});
