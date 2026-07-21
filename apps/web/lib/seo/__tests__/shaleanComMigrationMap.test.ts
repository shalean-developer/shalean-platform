import { describe, expect, it } from "vitest";
import {
  SHALEAN_COM_MIGRATION_STATUS,
  absoluteShaleanCoZaUrl,
  buildShaleanComHtaccessRules,
  getShaleanComMigrationRules,
  resolveShaleanComDestinationPath,
} from "@/lib/seo/shaleanComMigrationMap";

describe("shaleanComMigrationMap", () => {
  it("marks external Plesk application as pending", () => {
    expect(SHALEAN_COM_MIGRATION_STATUS).toBe("PENDING_EXTERNAL_PLESK");
  });

  it("maps known high-value .com paths one-to-one", () => {
    expect(resolveShaleanComDestinationPath("/contact")).toBe("/contact");
    expect(resolveShaleanComDestinationPath("/quote")).toBe("/quote");
    expect(resolveShaleanComDestinationPath("/services")).toBe("/services");
    expect(resolveShaleanComDestinationPath("/about-us-shalean-cleaning-services")).toBe("/about");
    expect(resolveShaleanComDestinationPath("/testimonials")).toBe("/reviews");
  });

  it("does not dump unknown article-like paths to homepage", () => {
    expect(resolveShaleanComDestinationPath("/blog/some-legacy-article")).toBe(
      "/blog/some-legacy-article",
    );
    expect(resolveShaleanComDestinationPath("/blog/some-legacy-article")).not.toBe("/");
  });

  it("includes location and blog rules in the explicit map", () => {
    const rules = getShaleanComMigrationRules();
    expect(rules.some((r) => r.sourcePath.startsWith("/locations/"))).toBe(true);
    expect(rules.some((r) => r.sourcePath.startsWith("/blog/"))).toBe(true);
    expect(rules.length).toBeGreaterThan(50);
  });

  it("builds htaccess with pending status and path-preserve fallback", () => {
    const ht = buildShaleanComHtaccessRules();
    expect(ht).toContain("PENDING_EXTERNAL_PLESK");
    expect(ht).toContain("RewriteEngine On");
    expect(ht).toContain("https://shalean.co.za/$1");
    expect(absoluteShaleanCoZaUrl("/contact")).toBe("https://shalean.co.za/contact");
  });
});
