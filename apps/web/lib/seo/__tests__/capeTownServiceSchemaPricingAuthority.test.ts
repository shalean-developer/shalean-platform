import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const rendererSource = readFileSync(
  join(process.cwd(), "components/seo/SeoCapeTownServicePage.tsx"),
  "utf8",
);

describe("Cape Town service schema pricing authority", () => {
  it("does not publish a static Service Offer or embedded price range", () => {
    expect(rendererSource).not.toContain('"@type": "Offer"');
    expect(rendererSource).not.toContain("lowPrice");
    expect(rendererSource).not.toContain("highPrice");
    expect(rendererSource).not.toContain("#cleaning-services-commercial");
    expect(rendererSource).not.toContain('priceCurrency: "ZAR"');
  });

  it("keeps the canonical service graph and governed pricing link", () => {
    expect(rendererSource).toContain('"@type": ["Service", "CleaningService"]');
    expect(rendererSource).toContain('provider: { "@id": localBusinessId }');
    expect(rendererSource).toContain("CAPE_TOWN_PRICING_AUTHORITY_HREF");
  });
});
