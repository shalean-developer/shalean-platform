import { readFileSync } from "fs";
import { resolve } from "path";
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

const HTACCESS_PATH = resolve(__dirname, "../../../ops/seo/shalean-com-plesk.htaccess");

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

  it("remaps legacy service slugs to Cape Town destinations", () => {
    expect(resolveShaleanComDestinationPath("/services/standard-cleaning")).toBe(
      "/services/standard-cleaning-cape-town",
    );
    expect(resolveShaleanComDestinationPath("/services/deep-cleaning")).toBe(
      "/services/deep-cleaning-cape-town",
    );
    expect(resolveShaleanComDestinationPath("/services/move-in-out-cleaning")).toBe(
      "/services/move-out-cleaning-cape-town",
    );
    expect(resolveShaleanComDestinationPath("/home-cleaning")).toBe(
      "/services/standard-cleaning-cape-town",
    );
  });

  it("remaps legacy /location/cape-town/{area} URLs to location hubs", () => {
    expect(resolveShaleanComDestinationPath("/location/cape-town/sea-point")).toBe(
      "/locations/sea-point-cleaning-services",
    );
    expect(resolveShaleanComDestinationPath("/location/cape-town/camps-bay")).toBe(
      "/locations/camps-bay-cleaning-services",
    );
    expect(resolveShaleanComDestinationPath("/cleaning-services/sea-point")).toBe(
      "/locations/sea-point-cleaning-services",
    );
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

  it("has unique source paths with no ambiguous destination conflicts", () => {
    const rules = getShaleanComMigrationRules();
    const bySource = new Map<string, Set<string>>();
    for (const rule of rules) {
      const key = rule.sourcePath;
      if (!bySource.has(key)) bySource.set(key, new Set());
      bySource.get(key)!.add(rule.destinationPath);
    }
    expect(bySource.size).toBe(rules.length);
    const ambiguous = [...bySource.entries()].filter(([, dests]) => dests.size > 1);
    expect(ambiguous).toEqual([]);
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

describe("shalean-com-plesk.htaccess artifact (full map)", () => {
  const artifact = readFileSync(HTACCESS_PATH, "utf8");
  const rules = getShaleanComMigrationRules();
  const generatedBlock = buildShaleanComHtaccessRules();

  it("preserves WordPress, LiteSpeed cache, and PHP handler blocks", () => {
    expect(artifact).toContain("# BEGIN WordPress");
    expect(artifact).toContain("# END WordPress");
    expect(artifact).toContain("# BEGIN LSCACHE");
    expect(artifact).toContain("# END LSCACHE");
    expect(artifact).toContain("# BEGIN cPanel-generated php ini directives");
    expect(artifact).toContain("# php -- BEGIN cPanel-generated handler");
  });

  it("embeds the generated migration block before WordPress", () => {
    const migIdx = artifact.indexOf("# BEGIN SHALEAN.COM FULL MIGRATION MAP");
    const wpIdx = artifact.indexOf("# BEGIN WordPress");
    expect(migIdx).toBeGreaterThan(-1);
    expect(wpIdx).toBeGreaterThan(migIdx);
    // Core generated rules must be present verbatim
    expect(artifact).toContain("RewriteCond %{HTTP_HOST} ^(www\\.)?shalean\\.com$ [NC]");
    expect(artifact).toContain(
      "RewriteRule ^services/standard-cleaning/?$ https://shalean.co.za/services/standard-cleaning-cape-town [R=301,L,QSA]",
    );
    expect(artifact).toContain(
      "RewriteRule ^location/cape-town/sea-point/?$ https://shalean.co.za/locations/sea-point-cleaning-services [R=301,L,QSA]",
    );
  });

  it("represents every approved map entry exactly once as a host-scoped 301", () => {
    const missing: string[] = [];
    const duplicatePatterns: string[] = [];

    for (const rule of rules) {
      const dest = absoluteShaleanCoZaUrl(rule.destinationPath);
      const flags = dest.includes("#") ? "[R=301,L,QSA,NE]" : "[R=301,L,QSA]";
      let rewriteLine: string;
      if (rule.sourcePath === "/") {
        rewriteLine = `RewriteRule ^/?$ ${dest} ${flags}`;
      } else {
        const src = rule.sourcePath.replace(/^\//, "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        rewriteLine = `RewriteRule ^${src}/?$ ${dest} ${flags}`;
      }
      const occurrences = artifact.split(rewriteLine).length - 1;
      if (occurrences === 0) missing.push(rule.sourcePath);
      if (occurrences > 1) duplicatePatterns.push(rule.sourcePath);
    }

    expect(missing).toEqual([]);
    expect(duplicatePatterns).toEqual([]);
    expect(rules.length).toBe(193);
  });

  it("keeps path-preserve fallback last among shalean.com migration RewriteRules", () => {
    const migStart = artifact.indexOf("# BEGIN SHALEAN.COM FULL MIGRATION MAP");
    const migEnd = artifact.indexOf("# END SHALEAN.COM FULL MIGRATION MAP");
    const mig = artifact.slice(migStart, migEnd);
    const rewriteRules = [...mig.matchAll(/^\s*RewriteRule\b.*$/gim)].map((m) => m[0]);
    expect(rewriteRules.length).toBe(rules.length + 1);
    expect(rewriteRules[rewriteRules.length - 1]).toMatch(
      /RewriteRule \^\(\.\*\)\$ https:\/\/shalean\.co\.za\/\$1 \[R=301,L,QSA\]/,
    );
  });

  it("uses permanent 301 only for shalean.com migration RewriteRules", () => {
    const migStart = artifact.indexOf("# BEGIN SHALEAN.COM FULL MIGRATION MAP");
    const migEnd = artifact.indexOf("# END SHALEAN.COM FULL MIGRATION MAP");
    const mig = artifact.slice(migStart, migEnd);
    const bad = [...mig.matchAll(/RewriteRule[^\n]+\[([^\]]+)\]/g)].filter((m) => {
      const flags = m[1];
      return !/\bR=301\b/.test(flags) || !/\bL\b/.test(flags);
    });
    expect(bad).toEqual([]);
    expect(mig).not.toMatch(/R=302|R=307|R=308/);
  });

  it("matches buildShaleanComHtaccessRules output for every mapped RewriteRule line", () => {
    for (const line of generatedBlock.split("\n")) {
      if (!line.startsWith("RewriteRule ") && !line.startsWith("RewriteCond ")) continue;
      expect(artifact).toContain(line);
    }
  });

  it("documents QSA query-string preservation on mapped rules", () => {
    expect(artifact).toContain("[R=301,L,QSA]");
    expect(artifact).toMatch(/how-it-works\/\?\$ https:\/\/shalean\.co\.za\/#how-it-works \[R=301,L,QSA,NE\]/);
  });
});
