/**
 * Writes supabase/seed/update_blog_posts_location_hubs_content_json.sql
 *
 * From repo root (shalean-platform): npx tsx apps/web/scripts/export-location-hub-sql-updates.ts
 * From apps/web: npx tsx scripts/export-location-hub-sql-updates.ts
 * Do not use apps/web/... when cwd is already apps/web (avoids apps/web/apps/web/...).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LOCATION_HUB_STRUCTURED_PAGES } from "../lib/blog/seed/locationHubStructuredContent";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const out = path.join(root, "supabase", "seed", "update_blog_posts_location_hubs_content_json.sql");

/** PostgreSQL dollar-quote delimiter that cannot appear inside `body`. */
function dollarQuoteJson(body: string): string {
  let i = 0;
  let tag: string;
  do {
    tag = `lh_${i}_`;
    i += 1;
    // Delimiter is $tag$ — must not appear verbatim inside JSON payload.
  } while (body.includes(`$${tag}$`));
  const delim = `$${tag}$`;
  // Build with concatenation: template literals treat `${` inside `$${body}` as interpolation.
  return delim + body + delim;
}

function sqlStringLiteral(s: string): string {
  return `'${s.replace(/'/g, "''")}'`;
}

const slugs = LOCATION_HUB_STRUCTURED_PAGES.map((p) => p.slug);
const slugListSql = slugs.map((s) => `  ${sqlStringLiteral(s)}`).join(",\n");

const lines: string[] = [
  "-- Location hub pages: set content_json from LOCATION_HUB_STRUCTURED_PAGES",
  "-- Does not INSERT. Only UPDATE rows whose slug matches exactly.",
  "-- Source: apps/web/lib/blog/seed/locationHubStructuredContent.ts",
  "-- Regenerate: npx tsx apps/web/scripts/export-location-hub-sql-updates.ts",
  "",
  "BEGIN;",
  "",
];

for (const page of LOCATION_HUB_STRUCTURED_PAGES) {
  const payload = JSON.stringify(page.content_json);
  const quoted = dollarQuoteJson(payload);
  lines.push("UPDATE public.blog_posts");
  lines.push(`SET content_json = ${quoted}::jsonb,`);
  lines.push("    updated_at = now()");
  lines.push(`WHERE slug = ${sqlStringLiteral(page.slug)};`);
  lines.push("");
}

lines.push("COMMIT;");
lines.push("");
lines.push("-- Expected: each UPDATE returns UPDATE 1 in psql (7 updates ⇒ 7 rows touched total).");
lines.push("-- Hub rows present in DB:");
lines.push("SELECT slug, updated_at");
lines.push("FROM public.blog_posts");
lines.push("WHERE slug IN (");
lines.push(slugListSql);
lines.push(")");
lines.push("ORDER BY slug;");
lines.push("");
lines.push("-- Seed slugs missing from blog_posts (should return 0 rows):");
lines.push("WITH expected(slug) AS (");
lines.push("  VALUES");
lines.push(
  LOCATION_HUB_STRUCTURED_PAGES.map((p) => `    (${sqlStringLiteral(p.slug)})`).join(",\n")
);
lines.push(")");
lines.push("SELECT e.slug AS missing_slug");
lines.push("FROM expected e");
lines.push("WHERE NOT EXISTS (");
lines.push("  SELECT 1 FROM public.blog_posts b WHERE b.slug = e.slug");
lines.push(");");
lines.push("");
lines.push("-- How many of the 7 hub slugs exist (expect 7 after seeds/migrations):");
lines.push("SELECT COUNT(*)::int AS hub_posts_found_in_db");
lines.push("FROM public.blog_posts");
lines.push("WHERE slug IN (");
lines.push(slugListSql);
lines.push(");");

fs.writeFileSync(out, lines.join("\n"), "utf8");
process.stderr.write(`Wrote ${out}\n`);
