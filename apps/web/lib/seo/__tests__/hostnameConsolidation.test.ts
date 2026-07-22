import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SITE_ORIGIN, absoluteCanonicalUrl } from "@/lib/site/canonical";

describe("hostname consolidation (P0-1 regression)", () => {
  it("SITE_ORIGIN and canonicals use apex shalean.co.za", () => {
    expect(SITE_ORIGIN).toBe("https://shalean.co.za");
    expect(absoluteCanonicalUrl("/services")).toBe("https://shalean.co.za/services");
    expect(absoluteCanonicalUrl("/")).not.toContain("www.");
  });

  it("next.config declares permanent www → apex host redirect", () => {
    const configPath = path.join(process.cwd(), "next.config.ts");
    const src = readFileSync(configPath, "utf8");
    expect(src).toContain('value: "www.shalean.co.za"');
    expect(src).toContain("https://shalean.co.za/:path*");
    expect(src).toMatch(/permanent:\s*true/);
  });
});
