/**
 * One-to-one `shalean.com` → `https://shalean.co.za` migration map (repo source of truth).
 *
 * EXTERNAL APPLICATION STATUS (accurate as of location expansion PR #94):
 * - **193** explicit rules: previously applied on Plesk and HTTP-verified (2026-07-22).
 * - **80** newly generated location-expansion rules (20 hubs × 4 path patterns): prepared
 *   in-repo only — **not** Plesk-applied and **not** HTTP-verified.
 * - **273** total explicit rules: repository **candidate** state only.
 * - Path-preserving fallback remains in the generated artifact.
 * - Do **not** describe the complete 273-rule artifact as `LIVE_HTTP_VERIFIED`.
 *
 * Evidence (193-rule apply): `docs/audits/seo/SHALEAN-COM-PLESK-FULL-MAP-HTTP-VERIFICATION-2026-07-22.md`
 */

import { CAPE_TOWN_LOCATIONS, HUB_SUFFIX } from "@/lib/seo/capeTownLocations";
import { ROUTED_HIGH_CONVERSION_POSTS } from "@/lib/blog/highConversionPosts";
import { AIRBNB_HOST_GUIDE_POSTS } from "@/lib/blog/airbnbHostGuidePosts";
import { ROUTED_PROGRAMMATIC_POSTS } from "@/lib/blog/programmaticPosts";
import {
  LOCATION_HUB_EXPANSION_JUL_2026_SLUGS,
  isLocationHubExpansionJul2026Slug,
} from "@/lib/seo/locationHubExpansion";

/** Plesk apply pending — do not claim live redirects without HTTP proof. */
export const SHALEAN_COM_MIGRATION_STATUS_PENDING = "PENDING_EXTERNAL_PLESK" as const;
/** Historical label for the 193-rule map that was applied and HTTP-verified on 2026-07-22. */
export const SHALEAN_COM_MIGRATION_STATUS_LIVE = "LIVE_HTTP_VERIFIED" as const;

export type ShaleanComMigrationStatus =
  | typeof SHALEAN_COM_MIGRATION_STATUS_PENDING
  | typeof SHALEAN_COM_MIGRATION_STATUS_LIVE;

/**
 * Current external migration state for the **complete** checked-in artifact.
 * The 273-rule candidate is not fully Plesk-applied/HTTP-verified — keep PENDING.
 */
export const SHALEAN_COM_MIGRATION_STATUS: ShaleanComMigrationStatus =
  SHALEAN_COM_MIGRATION_STATUS_PENDING;

/** Explicit rules HTTP-verified on Plesk (2026-07-22 full-map apply). */
export const SHALEAN_COM_PLESK_HTTP_VERIFIED_EXPLICIT_RULE_COUNT = 193;
/** New location-hub redirect patterns awaiting Plesk apply + HTTP verify (20 × 4). */
export const SHALEAN_COM_LOCATION_EXPANSION_PENDING_RULE_COUNT =
  LOCATION_HUB_EXPANSION_JUL_2026_SLUGS.length * 4;
/** Full explicit map size in the repository candidate artifact. */
export const SHALEAN_COM_REPO_CANDIDATE_EXPLICIT_RULE_COUNT =
  SHALEAN_COM_PLESK_HTTP_VERIFIED_EXPLICIT_RULE_COUNT +
  SHALEAN_COM_LOCATION_EXPANSION_PENDING_RULE_COUNT;

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

function locationAreaKebab(slug: string): string {
  return slug.endsWith(HUB_SUFFIX) ? slug.slice(0, -HUB_SUFFIX.length) : slug;
}

function locationComRulesForSlug(slug: string): ShaleanComMigrationRule[] {
  const areaKebab = locationAreaKebab(slug);
  const hub = `/locations/${slug}`;
  const pending = isLocationHubExpansionJul2026Slug(slug);
  const note = pending
    ? "Location expansion Jul 2026 — in-repo only; pending Plesk apply/HTTP verify"
    : undefined;
  return [
    { sourcePath: hub, destinationPath: hub, note },
    { sourcePath: `/location/cape-town/${areaKebab}`, destinationPath: hub, note },
    { sourcePath: `/cleaning-services/${areaKebab}`, destinationPath: hub, note },
    { sourcePath: `/cape-town/cleaning-services/${areaKebab}`, destinationPath: hub, note },
  ];
}

function locationComRules(): ShaleanComMigrationRule[] {
  return CAPE_TOWN_LOCATIONS.flatMap((row) => locationComRulesForSlug(row.slug));
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

/** Source paths for the 80 Jul-2026 location-expansion rules awaiting external verify. */
export function getPendingLocationExpansionComRules(): readonly ShaleanComMigrationRule[] {
  return LOCATION_HUB_EXPANSION_JUL_2026_SLUGS.flatMap((slug) => locationComRulesForSlug(slug));
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
 * Header reflects {@link SHALEAN_COM_MIGRATION_STATUS} (candidate pending full external verify).
 */
export function buildShaleanComHtaccessRules(): string {
  const hostCond = "RewriteCond %{HTTP_HOST} ^(www\\.)?shalean\\.com$ [NC]";
  const lines: string[] = [
    "# =============================================================================",
    "# shalean.com → https://shalean.co.za migration (Plesk / Apache / LiteSpeed)",
    `# STATUS: ${SHALEAN_COM_MIGRATION_STATUS} — repository candidate (${SHALEAN_COM_REPO_CANDIDATE_EXPLICIT_RULE_COUNT} explicit rules)`,
    `# PLESK HTTP-VERIFIED (2026-07-22): ${SHALEAN_COM_PLESK_HTTP_VERIFIED_EXPLICIT_RULE_COUNT} explicit rules previously applied`,
    `# PENDING PLESK APPLY/VERIFY: ${SHALEAN_COM_LOCATION_EXPANSION_PENDING_RULE_COUNT} location-expansion rules (20 hubs × 4 patterns)`,
    "# Path-preserving fallback included. Do not claim the full 273-rule map as LIVE_HTTP_VERIFIED.",
    "# Generated from apps/web/lib/seo/shaleanComMigrationMap.ts",
    "# Apply on the shalean.com document root in Plesk only after dual approval, then verify with curl -sI.",
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
