/**
 * One-to-one `shalean.com` → `https://shalean.co.za` migration map (repo source of truth).
 *
 * EXTERNAL APPLICATION STATUS: PENDING on Plesk/LiteSpeed for path-specific WordPress URLs.
 * Host-level path-preserving rules also exist in `next.config.ts` / `proxy.ts` for when `.com`
 * traffic reaches this Next app. Do not claim Plesk redirects are live without HTTP evidence.
 */

import { CAPE_TOWN_LOCATIONS, HUB_SUFFIX } from "@/lib/seo/capeTownLocations";
import { ROUTED_HIGH_CONVERSION_POSTS } from "@/lib/blog/highConversionPosts";
import { AIRBNB_HOST_GUIDE_POSTS } from "@/lib/blog/airbnbHostGuidePosts";
import { ROUTED_PROGRAMMATIC_POSTS } from "@/lib/blog/programmaticPosts";

export const SHALEAN_COM_MIGRATION_STATUS = "PENDING_EXTERNAL_PLESK" as const;

export type ShaleanComMigrationRule = {
  readonly sourcePath: string;
  readonly destinationPath: string;
  readonly note?: string;
};

const PRICING_DEST = "/blog/how-much-does-cleaning-cost-cape-town-2026";

/** Explicit high-value WordPress / legacy `.com` paths with known `.co.za` equivalents. */
const EXPLICIT_COM_RULES: readonly ShaleanComMigrationRule[] = [
  { sourcePath: "/", destinationPath: "/" },
  { sourcePath: "/contact", destinationPath: "/contact" },
  { sourcePath: "/quote", destinationPath: "/quote" },
  { sourcePath: "/services", destinationPath: "/services" },
  { sourcePath: "/about", destinationPath: "/about" },
  {
    sourcePath: "/about-us-shalean-cleaning-services",
    destinationPath: "/about",
    note: "Legacy WordPress about slug",
  },
  { sourcePath: "/blog", destinationPath: "/blog" },
  { sourcePath: "/faq", destinationPath: "/faq" },
  { sourcePath: "/reviews", destinationPath: "/reviews" },
  { sourcePath: "/testimonials", destinationPath: "/reviews" },
  { sourcePath: "/team", destinationPath: "/about" },
  { sourcePath: "/how-it-works", destinationPath: "/#how-it-works" },
  { sourcePath: "/book", destinationPath: "/book" },
  { sourcePath: "/privacy-policy", destinationPath: "/privacy-policy" },
  { sourcePath: "/privacy", destinationPath: "/privacy-policy" },
  { sourcePath: "/terms-of-service", destinationPath: "/terms-of-service" },
  { sourcePath: "/terms", destinationPath: "/terms-of-service" },
  { sourcePath: "/pricing", destinationPath: PRICING_DEST },
  { sourcePath: "/cleaning-prices-cape-town", destinationPath: PRICING_DEST },
  { sourcePath: "/cleaning-services-cape-town", destinationPath: "/services" },
  { sourcePath: "/maid-services-cape-town", destinationPath: "/services" },
  { sourcePath: "/home-cleaning", destinationPath: "/services/standard-cleaning-cape-town" },
  { sourcePath: "/deep-cleaning", destinationPath: "/services/deep-cleaning-cape-town" },
  { sourcePath: "/services/standard-cleaning", destinationPath: "/services/standard-cleaning-cape-town" },
  { sourcePath: "/services/deep-cleaning", destinationPath: "/services/deep-cleaning-cape-town" },
  { sourcePath: "/services/move-in-out-cleaning", destinationPath: "/services/move-out-cleaning-cape-town" },
  { sourcePath: "/services/office-cleaning", destinationPath: "/services/office-cleaning-cape-town" },
  { sourcePath: "/services/standard-cleaning-cape-town", destinationPath: "/services/standard-cleaning-cape-town" },
  { sourcePath: "/services/deep-cleaning-cape-town", destinationPath: "/services/deep-cleaning-cape-town" },
  { sourcePath: "/services/airbnb-cleaning-cape-town", destinationPath: "/services/airbnb-cleaning-cape-town" },
  { sourcePath: "/services/move-out-cleaning-cape-town", destinationPath: "/services/move-out-cleaning-cape-town" },
  { sourcePath: "/services/office-cleaning-cape-town", destinationPath: "/services/office-cleaning-cape-town" },
  { sourcePath: "/services/carpet-cleaning-cape-town", destinationPath: "/services/carpet-cleaning-cape-town" },
  { sourcePath: "/services/window-cleaning-cape-town", destinationPath: "/services/window-cleaning-cape-town" },
];

function locationComRules(): ShaleanComMigrationRule[] {
  return CAPE_TOWN_LOCATIONS.flatMap((row) => {
    const areaKebab = row.slug.endsWith(HUB_SUFFIX)
      ? row.slug.slice(0, -HUB_SUFFIX.length)
      : row.slug;
    const hub = `/locations/${row.slug}`;
    return [
      { sourcePath: hub, destinationPath: hub },
      { sourcePath: `/location/cape-town/${areaKebab}`, destinationPath: hub },
      { sourcePath: `/cleaning-services/${areaKebab}`, destinationPath: hub },
      { sourcePath: `/cape-town/cleaning-services/${areaKebab}`, destinationPath: hub },
    ];
  });
}

function blogComRules(): ShaleanComMigrationRule[] {
  const slugs = new Set<string>();
  for (const p of ROUTED_HIGH_CONVERSION_POSTS) slugs.add(p.slug);
  for (const p of ROUTED_PROGRAMMATIC_POSTS) slugs.add(p.slug);
  for (const p of AIRBNB_HOST_GUIDE_POSTS) slugs.add(p.slug);
  return [...slugs].sort().map((slug) => ({
    sourcePath: `/blog/${slug}`,
    destinationPath: `/blog/${slug}`,
  }));
}

function dedupeRules(rules: readonly ShaleanComMigrationRule[]): ShaleanComMigrationRule[] {
  const seen = new Set<string>();
  const out: ShaleanComMigrationRule[] = [];
  for (const rule of rules) {
    const key = rule.sourcePath.replace(/\/+$/, "") || "/";
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ ...rule, sourcePath: key });
  }
  return out;
}

/** Complete explicit map (exact paths). Catch-all path-preserve is separate for unknown URLs. */
export function getShaleanComMigrationRules(): readonly ShaleanComMigrationRule[] {
  return dedupeRules([...EXPLICIT_COM_RULES, ...locationComRules(), ...blogComRules()]);
}

export function resolveShaleanComDestinationPath(sourcePath: string): string {
  const norm = sourcePath.trim().replace(/\/+$/, "") || "/";
  const hit = getShaleanComMigrationRules().find((r) => r.sourcePath === norm);
  if (hit) return hit.destinationPath;
  // Path-preserve when no explicit override — never invent homepage dumps for unknown deep URLs.
  return norm.startsWith("/") ? norm : `/${norm}`;
}

export function absoluteShaleanCoZaUrl(pathname: string): string {
  if (pathname.startsWith("/#")) return `https://shalean.co.za/${pathname.slice(1)}`;
  const path = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return `https://shalean.co.za${path}`;
}

/**
 * Apache/LiteSpeed RewriteRule lines for Plesk (exact one-to-one + path-preserve fallback).
 * Status marked {@link SHALEAN_COM_MIGRATION_STATUS} until applied externally.
 */
export function buildShaleanComHtaccessRules(): string {
  const hostCond = "RewriteCond %{HTTP_HOST} ^(www\\.)?shalean\\.com$ [NC]";
  const lines: string[] = [
    "# =============================================================================",
    "# shalean.com → https://shalean.co.za migration (Plesk / Apache / LiteSpeed)",
    `# STATUS: ${SHALEAN_COM_MIGRATION_STATUS} — do not treat as live until HTTP-verified`,
    "# Generated from apps/web/lib/seo/shaleanComMigrationMap.ts",
    "# Apply on the shalean.com document root in Plesk, then verify with curl -sI.",
    "# =============================================================================",
    "RewriteEngine On",
    "",
    "# Explicit one-to-one map (QSA preserves query strings)",
  ];

  for (const rule of getShaleanComMigrationRules()) {
    const dest = absoluteShaleanCoZaUrl(rule.destinationPath);
    // NE keeps `#fragment` destinations unescaped (%23 breaks homepage anchors).
    const flags = dest.includes("#") ? "[R=301,L,QSA,NE]" : "[R=301,L,QSA]";
    lines.push(hostCond);
    if (rule.sourcePath === "/") {
      lines.push(`RewriteRule ^/?$ ${dest} ${flags}`);
    } else {
      const src = rule.sourcePath.replace(/^\//, "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      lines.push(`RewriteRule ^${src}/?$ ${dest} ${flags}`);
    }
  }

  lines.push(
    "",
    "# Path-preserving fallback for remaining public URLs (keeps query string)",
    hostCond,
    "RewriteRule ^(.*)$ https://shalean.co.za/$1 [R=301,L,QSA]",
    "",
  );

  return lines.join("\n");
}
