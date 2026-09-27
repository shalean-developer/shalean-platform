import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { injectMarkdownAutoLinks } from "@/lib/blog/seo/auto-link-keywords";
import { CAPE_TOWN_PRICING_AUTHORITY_HREF } from "@/lib/seo/internalLinks";
import { CLEANING_PRICES_CAPE_TOWN_PATH } from "@/lib/seo/marketingCleaningPricesHubMeta";
import { resolveLegacyMarketingExactRedirect } from "@/lib/seo/legacyMarketingRedirectMatrix";
import { resolveShaleanComDestinationPath } from "@/lib/seo/shaleanComMigrationMap";

describe("SITE-E2E-10 pricing redirect and internal-link convergence", () => {
  it("keeps the canonical pricing authority on the live pricing hub", () => {
    expect(CAPE_TOWN_PRICING_AUTHORITY_HREF).toBe(CLEANING_PRICES_CAPE_TOWN_PATH);
    expect(CLEANING_PRICES_CAPE_TOWN_PATH).toBe("/cleaning-prices-cape-town");
  });

  it("redirects the legacy /pricing alias one hop to the canonical pricing hub", () => {
    expect(resolveLegacyMarketingExactRedirect("/pricing")).toEqual({
      source: "/pricing",
      destination: "/cleaning-prices-cape-town",
      status: 308,
    });
  });

  it("keeps shalean.com pricing migration aligned with the canonical pricing hub", () => {
    expect(resolveShaleanComDestinationPath("/pricing")).toBe("/cleaning-prices-cape-town");
    expect(resolveShaleanComDestinationPath("/cleaning-prices-cape-town")).toBe(
      "/cleaning-prices-cape-town",
    );
  });

  it("auto-links pricing-intent copy directly to the pricing hub", () => {
    expect(injectMarkdownAutoLinks("Compare cleaning prices in Cape Town before you book.")).toContain(
      "[cleaning prices in Cape Town](/cleaning-prices-cape-town)",
    );
  });

  it("keeps next.config /pricing redirect aligned and avoids the methodology blog target", () => {
    const config = readFileSync(join(process.cwd(), "next.config.ts"), "utf8");
    const pricingBlock = config.match(/source:\s*"\/pricing"[\s\S]{0,180}?permanent:\s*true/);
    expect(pricingBlock?.[0]).toContain('destination: "/cleaning-prices-cape-town"');
    expect(pricingBlock?.[0]).not.toContain("/blog/how-much-does-cleaning-cost-cape-town-2026");
  });
});
