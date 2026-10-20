import { describe, expect, it } from "vitest";
import { buildEditorLinkTargets, searchEditorLinkTargets } from "./editor-link-targets";
import { injectInternalLinks } from "./seo/inject-internal-links";

describe("editor link destinations", () => {
  it("keeps canonical published titles and excludes redirect aliases", () => {
    const targets = buildEditorLinkTargets([{ slug: "my-published-guide", title: "My actual guide title" }, { slug: "cleaning-services-sea-point-cape-town", title: "Old redirect" }]);
    expect(targets.find(target => target.url === "/blog/my-published-guide")?.label).toBe("My actual guide title");
    expect(targets.some(target => target.label === "Old redirect")).toBe(false);
    expect(new Set(targets.map(target => target.url)).size).toBe(targets.length);
  });
  it("searches both URL and title without inventing unpublished posts", () => {
    const targets = buildEditorLinkTargets([]);
    expect(searchEditorLinkTargets(targets, "Sea Point").some(target => target.url === "/locations/sea-point-cleaning-services")).toBe(true);
    expect(searchEditorLinkTargets(targets, "deep cleaning").some(target => target.url === "/services/deep-cleaning-cape-town")).toBe(true);
    expect(searchEditorLinkTargets(targets, "nonexistent-draft-fixture")).toEqual([]);
  });
  it("labels the locations index accurately and preserves existing authored links", () => {
    const original = { schema_version: 1 as const, blocks: [{ id: "keep", type: "internal_links" as const, links: [{ label: "My own words", url: "/services/standard-cleaning-cape-town" }] }] };
    const result = injectInternalLinks(original, { location: "Cape Town", city: "Cape Town", service: "Standard Cleaning" });
    const links = result.blocks.flatMap(block => block.type === "internal_links" ? block.links : []);
    expect(links.find(link => link.url === "/locations")?.label).toBe("View all cleaning areas");
    expect(links.find(link => link.url === "/services/standard-cleaning-cape-town")?.label).toBe("My own words");
    expect(original.blocks[0].links).toHaveLength(1);
  });
});
