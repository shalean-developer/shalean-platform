import { describe, expect, it } from "vitest";
import {
  buildCapeTownServiceMetadata,
  CAPE_TOWN_SERVICE_SEO,
  locationPageServiceLinks,
  resolveCapeTownServiceSchemaFields,
} from "@/lib/seo/capeTownSeoPages";
import {
  getBlogAboveFoldServiceLink,
  getBlogIntentServicePair,
} from "@/lib/seo/internalLinks";
import { KEYWORD_PRIMARY_ROUTE } from "@/lib/seo/keyword-primary-route";

const DEEP_PATH = "/services/deep-cleaning-cape-town";

describe("SEO-E2E-06B Deep Cleaning query ownership", () => {
  it("assigns the exact GSC query to the Deep Cleaning service page", () => {
    expect(KEYWORD_PRIMARY_ROUTE["deep cleaning services cape town"]).toBe(DEEP_PATH);
    expect(KEYWORD_PRIMARY_ROUTE["deep cleaning cape town"]).toBe(DEEP_PATH);
  });

  it("aligns title, H1, description, keywords and schema around Deep Cleaning Services", () => {
    const block = CAPE_TOWN_SERVICE_SEO["deep-cleaning-cape-town"];
    const metadata = buildCapeTownServiceMetadata(block);
    const schema = resolveCapeTownServiceSchemaFields(block.slug, block);

    expect(block.path).toBe(DEEP_PATH);
    expect(String(metadata.title)).toBe("Deep Cleaning Services in Cape Town | Shalean");
    expect(block.h1.toLowerCase()).toContain("deep cleaning services in cape town");
    expect(String(metadata.description).toLowerCase()).toContain("deep cleaning services in cape town");
    expect(block.keywords).toContain("deep cleaning services cape town");
    expect(schema.schemaName).toBe("Deep Cleaning Services Cape Town | Shalean");
    expect(schema.schemaServiceType).toBe("Deep Cleaning Service");
  });

  it("points service-navigation anchor authority to the Deep Cleaning canonical page", () => {
    const deep = locationPageServiceLinks().find((link) => link.href === DEEP_PATH);
    expect(deep).toEqual({
      href: DEEP_PATH,
      label: "Deep cleaning services Cape Town",
    });
  });

  it("uses Deep Cleaning Services anchors for deep-intent editorial links", () => {
    const aboveFold = getBlogAboveFoldServiceLink("whats-included-in-deep-cleaning-cape-town");
    expect(aboveFold.href).toBe(DEEP_PATH);
    expect(aboveFold.anchor.toLowerCase()).toContain("deep cleaning services");

    const pair = getBlogIntentServicePair("deep", "deep-cleaning-guide");
    expect(pair[0]?.href).toBe(DEEP_PATH);
    expect(pair[0]?.anchor.toLowerCase()).toContain("deep cleaning services");
  });

  it("does not assign the exact deep-cleaning query to the homepage or generic services hub", () => {
    expect(KEYWORD_PRIMARY_ROUTE["deep cleaning services cape town"]).not.toBe("/");
    expect(KEYWORD_PRIMARY_ROUTE["deep cleaning services cape town"]).not.toBe("/services");
  });
});
