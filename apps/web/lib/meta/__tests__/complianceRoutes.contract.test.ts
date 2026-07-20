import { describe, expect, it } from "vitest";
import { absoluteCanonicalUrl } from "@/lib/site/canonical";

/**
 * Compliance route contract for Meta App Dashboard + public legal pages.
 * `/privacy` → `/privacy-policy` is configured as a permanent redirect in next.config.ts.
 */
describe("privacy and data-deletion route contract", () => {
  it("uses /privacy-policy as the canonical privacy URL", () => {
    expect(absoluteCanonicalUrl("/privacy-policy")).toBe("https://shalean.co.za/privacy-policy");
  });

  it("exposes public data-deletion and status paths", () => {
    expect(absoluteCanonicalUrl("/data-deletion")).toBe("https://shalean.co.za/data-deletion");
    expect(absoluteCanonicalUrl("/data-deletion/status")).toBe(
      "https://shalean.co.za/data-deletion/status",
    );
  });

  it("documents Meta callback path", () => {
    expect(absoluteCanonicalUrl("/api/meta/data-deletion")).toBe(
      "https://shalean.co.za/api/meta/data-deletion",
    );
  });
});
