import { describe, expect, it } from "vitest";
import { PRIMARY_LOCAL_BUSINESS_ID } from "@/lib/seo/primaryLocalBusinessJsonLd";
import {
  buildWebSiteJsonLdNode,
  SITE_WEBSITE_ID,
  WEBSITE_ALTERNATE_NAMES,
} from "@/lib/seo/schemaGraph";
import { SITE_ORIGIN } from "@/lib/site/canonical";

describe("buildWebSiteJsonLdNode", () => {
  it("emits preferred site name and alternateName for Google site-name signals", () => {
    const node = buildWebSiteJsonLdNode();

    expect(node).toEqual({
      "@type": "WebSite",
      "@id": SITE_WEBSITE_ID,
      url: SITE_ORIGIN,
      name: "Shalean Cleaning Services",
      alternateName: ["Shalean"],
      inLanguage: "en-ZA",
      publisher: { "@id": PRIMARY_LOCAL_BUSINESS_ID },
    });
    expect(node.alternateName).toEqual([...WEBSITE_ALTERNATE_NAMES]);
    expect(node).not.toHaveProperty("potentialAction");
  });

  it("adds SearchAction only when includeSearchAction and env target are set", () => {
    const prev = process.env.NEXT_PUBLIC_SITE_SEARCH_ACTION_TARGET;
    process.env.NEXT_PUBLIC_SITE_SEARCH_ACTION_TARGET =
      "https://shalean.co.za/search?q={search_term_string}";
    try {
      const node = buildWebSiteJsonLdNode({ includeSearchAction: true });
      expect(node.potentialAction).toEqual({
        "@type": "SearchAction",
        target: "https://shalean.co.za/search?q={search_term_string}",
        "query-input": "required name=search_term_string",
      });
      expect(node.alternateName).toEqual(["Shalean"]);
    } finally {
      if (prev === undefined) {
        delete process.env.NEXT_PUBLIC_SITE_SEARCH_ACTION_TARGET;
      } else {
        process.env.NEXT_PUBLIC_SITE_SEARCH_ACTION_TARGET = prev;
      }
    }
  });
});
