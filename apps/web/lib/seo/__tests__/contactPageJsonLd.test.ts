import { describe, expect, it } from "vitest";
import { buildContactPageJsonLdGraph } from "@/lib/seo/contactPageJsonLd";

describe("contactPageJsonLd", () => {
  it("includes ContactPage and LocalBusiness contactPoint", () => {
    const graph = buildContactPageJsonLdGraph();
    expect(graph["@graph"]).toBeDefined();
    const nodes = graph["@graph"] as Record<string, unknown>[];
    expect(nodes.some((n) => n["@type"] === "ContactPage")).toBe(true);
    const lb = nodes.find((n) => n["@type"] === "LocalBusiness");
    expect(lb).toBeDefined();
    expect(lb?.contactPoint).toBeDefined();
  });
});
