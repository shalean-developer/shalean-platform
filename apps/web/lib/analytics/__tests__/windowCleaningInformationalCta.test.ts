import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Window cleaning is not in booking-v2 SERVICE_SLUGS — home + service pages must stay
 * informational (no /book CTA that dumps users into an unsupported flow).
 */
describe("window cleaning informational CTAs", () => {
  it("ServicesSection keeps Window Cleaning bookCta=false (no BookCleaningLink)", () => {
    const src = readFileSync(join(process.cwd(), "components/home/sections/ServicesSection.tsx"), "utf8");
    expect(src).toMatch(/title:\s*"Window Cleaning"[\s\S]*?bookCta:\s*false/);
    expect(src).toMatch(/s\.kind === "link" && s\.bookCta/);
  });

  it("ServicePageCommercialIntentSection does not send window-cleaning to /book", () => {
    const src = readFileSync(
      join(process.cwd(), "components/seo/ServicePageCommercialIntentSection.tsx"),
      "utf8",
    );
    // Window branch must not include the shared /book CTA used by other service pages.
    const windowBlock = src.slice(
      src.indexOf('slug === "window-cleaning-cape-town" ? ('),
      src.indexOf(") : (", src.indexOf('slug === "window-cleaning-cape-town" ? (') + 10),
    );
    expect(windowBlock).toContain("Hosting guests?");
    expect(windowBlock).not.toContain('href="/book"');
  });
});
