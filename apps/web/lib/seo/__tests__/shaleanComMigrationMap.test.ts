import { describe, expect, it } from "vitest";
import {
  SHALEAN_COM_MIGRATION_STATUS,
  SHALEAN_COM_MIGRATION_STATUS_LIVE,
  SHALEAN_COM_MIGRATION_STATUS_PENDING,
  absoluteShaleanCoZaUrl,
  buildShaleanComHtaccessRules,
  getShaleanComMigrationRules,
  resolveShaleanComDestinationPath,
} from "@/lib/seo/shaleanComMigrationMap";

describe("shaleanComMigrationMap", () => {
  it("marks external Plesk migration as live/HTTP-verified", () => {
    expect(SHALEAN_COM_MIGRATION_STATUS_PENDING).toBe("PENDING_EXTERNAL_PLESK");
    expect(SHALEAN_COM_MIGRATION_STATUS_LIVE).toBe("LIVE_HTTP_VERIFIED");
    expect(SHALEAN_COM_MIGRATION_STATUS).toBe(SHALEAN_COM_MIGRATION_STATUS_LIVE);
    expect(SHALEAN_COM_MIGRATION_STATUS).not.toBe(SHALEAN_COM_MIGRATION_STATUS_PENDING);
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

  it("builds htaccess with live status and path-preserve fallback", () => {
    const ht = buildShaleanComHtaccessRules();
    expect(ht).toContain("LIVE_HTTP_VERIFIED");
    expect(ht).not.toContain("PENDING_EXTERNAL_PLESK");
    expect(ht).toContain("RewriteEngine On");
    expect(ht).toContain("https://shalean.co.za/$1");
    expect(ht).toMatch(/#how-it-works \[R=301,L,QSA,NE\]/);
    expect(absoluteShaleanCoZaUrl("/contact")).toBe("https://shalean.co.za/contact");
  });
});
