import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const readSource = (path: string) =>
  readFileSync(join(process.cwd(), path), "utf8");

describe("primary Cape Town service hero contract", () => {
  it("routes the six-service template through the explicit primary hero variant", () => {
    const template = readSource(
      "components/services/PrimaryCapeTownServicePageTemplate.tsx",
    );
    expect(template).toContain('heroVariant="primary"');
    expect(template).toContain('"standard-cleaning-cape-town"');
    expect(template).toContain('"carpet-cleaning-cape-town"');
    expect(template).not.toContain('"window-cleaning-cape-town"');
  });

  it("uses named hero classes instead of positional page-DOM selectors", () => {
    const styles = readSource(
      "components/services/PrimaryCapeTownServicePageTemplate.module.css",
    );
    expect(styles).toContain(".heroGrid");
    expect(styles).toContain(".heroCopy");
    expect(styles).toContain(".heroMedia");
    expect(styles).not.toContain(":global(main)");
    expect(styles).not.toContain(":nth-child(");
  });

  it("keeps service-specific structures behind controlled template slots", () => {
    const template = readSource(
      "components/services/PrimaryCapeTownServicePageTemplate.tsx",
    );
    const renderer = readSource("components/seo/SeoCapeTownServicePage.tsx");
    const extensions = readSource(
      "components/services/PrimaryCapeTownServiceExtensions.tsx",
    );

    expect(template).toContain("buildPrimaryCapeTownServiceExtensionSlots");
    for (const slot of [
      "afterHero",
      "overviewLead",
      "overviewTail",
      "afterIncluded",
      "afterBenefits",
      "beforeAreas",
      "areasLead",
    ]) {
      expect(renderer).toContain(`extensionSlots?.${slot}`);
    }
    for (const service of ["standard", "airbnb", "move", "office", "carpet"]) {
      expect(extensions).toContain(`kind: "${service}"`);
    }
    expect(renderer).not.toContain("AirbnbCapeTownServiceExtendedContent");
    expect(renderer).not.toContain("StandardCleaningCapeTownEnhancements");
  });
});
