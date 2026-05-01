/**
 * Bulk-create programmatic blog drafts (location × service matrix).
 *
 * From apps/web with service role:
 *   npx tsx scripts/generate-programmatic-posts.ts
 *   npx tsx scripts/generate-programmatic-posts.ts --dry-run
 *   npx tsx scripts/generate-programmatic-posts.ts --limit=50
 */

import { createClient } from "@supabase/supabase-js";
import { LOCATIONS } from "../lib/locations";
import { CAPE_TOWN_SEO_SERVICE_SLUGS } from "../lib/seo/capeTownSeoPages";
import { generateProgrammaticPost } from "../lib/blog/generators/generate-programmatic-post";
import { saveProgrammaticPost } from "../lib/blog/generators/save-programmatic-post";

const dryRun = process.argv.includes("--dry-run");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY;

function parseLimitArg(): number | undefined {
  const raw = process.argv.find((a) => a.startsWith("--limit="));
  if (!raw) return undefined;
  const n = Number.parseInt(raw.slice("--limit=".length), 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

const pairLimit = parseLimitArg();

function serviceKeyFromSeoSlug(seo: string): string {
  return seo.replace(/-cape-town$/u, "");
}

function serviceDisplayName(key: string): string {
  return key
    .split("-")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  if (!dryRun && (!url?.trim() || !key?.trim())) {
    console.error("Set NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY.");
    process.exit(1);
  }

  const locations = LOCATIONS.filter((l) => l.slug !== l.citySlug);
  const serviceKeys = CAPE_TOWN_SEO_SERVICE_SLUGS.map(serviceKeyFromSeoSlug);

  let related: { slug: string; title: string }[] = [];
  if (!dryRun && url && key) {
    const admin = createClient(url, key, { auth: { persistSession: false } });
    const { data } = await admin
      .from("blog_posts")
      .select("slug,title")
      .eq("status", "published")
      .order("published_at", { ascending: false, nullsFirst: false })
      .limit(40);
    related =
      (data as { slug?: string; title?: string }[] | null)?.flatMap((r) =>
        r.slug && r.title ? [{ slug: r.slug, title: r.title }] : [],
      ) ?? [];
  }

  let created = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;
  let processed = 0;

  outer: for (const loc of locations) {
    for (const serviceSlug of serviceKeys) {
      if (pairLimit != null && processed >= pairLimit) {
        break outer;
      }
      processed += 1;

      const serviceName = serviceDisplayName(serviceSlug);
      const post = generateProgrammaticPost({
        location: loc.name,
        city: loc.cityName,
        service: serviceName,
        locationSlug: loc.slug,
        citySlug: loc.citySlug,
        serviceSlug,
        relatedBlogPosts: related,
      });

      if (dryRun) {
        console.log("[dry-run]", post.slug);
        continue;
      }

      const res = await saveProgrammaticPost(post);
      if (res.ok) {
        if (res.action === "update") {
          updated += 1;
          console.log("updated", post.slug, res.id);
        } else {
          created += 1;
          console.log("created", post.slug, res.id);
        }
      } else if (res.reason === "slug_exists") {
        skipped += 1;
        console.log("skip slug", post.slug);
      } else {
        failed += 1;
        console.error("fail", { slug: post.slug, reason: res.reason, message: res.message });
      }

      await sleep(50);
    }
  }

  console.log(
    JSON.stringify({
      dryRun,
      created,
      updated,
      skipped,
      failed,
      processed,
      pairLimit: pairLimit ?? null,
      matrixSize: locations.length * serviceKeys.length,
    }),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
