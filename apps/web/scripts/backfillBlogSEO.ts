/**
 * Backfill primary_keyword, secondary_keywords, search_intent on blog_posts
 * only where each column is currently NULL (never overwrites).
 *
 * Usage (from apps/web):
 *   npx tsx scripts/backfillBlogSEO.ts
 *   npx tsx scripts/backfillBlogSEO.ts --dry-run
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
 */

import { createClient } from "@supabase/supabase-js";
import { LOCATIONS } from "../lib/locations";

const dryRun = process.argv.includes("--dry-run");

type Row = {
  id: string;
  slug: string;
  title: string;
  h1: string | null;
  primary_keyword: string | null;
  secondary_keywords: string[] | null;
  search_intent: string | null;
};

/** Stripped from final primary_keyword — conversational filler, not query tokens. */
const PRIMARY_KEYWORD_FILLERS = new Set(["actually", "really", "basically", "simply", "just"]);

const STOP = new Set([
  "a",
  "an",
  "the",
  "and",
  "or",
  "for",
  "to",
  "of",
  "in",
  "on",
  "at",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "being",
  "have",
  "has",
  "had",
  "do",
  "does",
  "did",
  "will",
  "would",
  "could",
  "should",
  "may",
  "might",
  "must",
  "can",
  "need",
  "your",
  "our",
  "we",
  "you",
  "it",
  "this",
  "that",
  "with",
  "from",
  "by",
  "about",
  "into",
  "when",
  "where",
  "why",
  "how",
  "what",
  "which",
  "who",
  "whom",
  "whose",
  "all",
  "any",
  "both",
  "each",
  "few",
  "more",
  "most",
  "other",
  "some",
  "such",
  "no",
  "nor",
  "not",
  "only",
  "own",
  "same",
  "so",
  "than",
  "too",
  "very",
  "just",
  "also",
  "now",
  "here",
  "there",
  "then",
  "once",
  "get",
  "got",
  "make",
  "made",
  "see",
  "know",
  "take",
  "come",
  "use",
  "go",
  "way",
  "may",
  "new",
  "first",
  "well",
  "much",
  "many",
]);

/**
 * Short, search-style phrase: drop filler words, collapse whitespace, trim.
 */
function cleanPrimaryKeyword(phrase: string): string {
  const tokens = phrase
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.replace(/^'+|'+$/g, ""))
    .filter((w) => w.length > 0 && !PRIMARY_KEYWORD_FILLERS.has(w));
  return tokens.join(" ").replace(/\s+/g, " ").trim();
}

function normalizeHeadline(raw: string): string {
  let s = raw.trim();
  s = s.replace(/\s*\|\s*shalean\b.*$/i, "").trim();
  s = s.replace(/[–—|]/g, " ");
  s = s.replace(/[^\w\s']/g, " ");
  return s.replace(/\s+/g, " ").trim();
}

/** Location hint from slug/title (suburb name lowercased), excluding city umbrella. */
function findAreaHint(slug: string, title: string, h1: string | null): string | null {
  const hay = `${slug} ${title} ${h1 ?? ""}`.toLowerCase();
  let best: { slug: string; name: string } | null = null;
  for (const loc of LOCATIONS) {
    if (loc.slug === "cape-town" || loc.slug === "johannesburg") continue;
    const nameLower = loc.name.toLowerCase();
    const slugHyphen = loc.slug.toLowerCase();
    const slugSpace = slugHyphen.replace(/-/g, " ");
    if (
      hay.includes(slugHyphen) ||
      hay.includes(slugSpace) ||
      hay.includes(nameLower) ||
      new RegExp(`\\b${slugHyphen.replace(/-/g, "[-\\s]")}\\b`, "i").test(hay)
    ) {
      if (!best || loc.slug.length > best.slug.length) {
        best = { slug: loc.slug, name: nameLower };
      }
    }
  }
  return best?.name ?? null;
}

function inferSearchIntent(title: string, slug: string, h1: string | null): "transactional" | "informational" {
  const t = `${title} ${slug} ${h1 ?? ""}`.toLowerCase();

  const transactional =
    /\b(price|pricing|cost|how much|rates?|book|booking|hire|quote|near me|schedule|same[- ]day|get instant|cleaners?\s+near|services?\s+in\s+\w+|cleaning\s+in\s+\w+)\b/.test(
      t,
    );

  const informational =
    /\b(vs\.?|versus|guide|tips|checklist|how to|what is|why|mistakes|routine|worth\s+hiring|often|long\s+does|prepare|deep\s+cleaning\s+vs|comparison|explained)\b/.test(
      t,
    );

  if (informational && !transactional) return "informational";
  if (transactional && !informational) return "transactional";
  if (transactional && informational) {
    return /\b(price|pricing|cost|how much|book|quote|hire)\b/.test(t) ? "transactional" : "informational";
  }
  return "informational";
}

function derivePrimaryKeyword(title: string, h1: string | null, slug: string): string {
  const raw = (h1?.trim() || title).trim();
  let base = normalizeHeadline(raw).toLowerCase();
  if (!base) base = slug.replace(/-/g, " ");

  const wantsPrice = /\b(how much|price|pricing|cost|rates?)\b/i.test(raw);
  const area = findAreaHint(slug, title, h1);

  const tokens = base
    .split(/\s+/)
    .map((w) => w.replace(/^'+|'+$/g, ""))
    .filter((w) => w.length > 1 && !STOP.has(w) && !PRIMARY_KEYWORD_FILLERS.has(w));

  let words = tokens.slice(0, 10);

  if (wantsPrice && !words.some((w) => ["price", "pricing", "cost", "rates"].includes(w))) {
    words = [...words, "price"];
  }

  let phrase = words.join(" ").replace(/\s+/g, " ").trim();

  if (phrase.length < 8 && slug) {
    phrase = slug
      .replace(/-cape-town$/i, "")
      .replace(/-/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  if (area && !phrase.includes(area)) {
    phrase = `${phrase} ${area}`.trim();
  }

  phrase = phrase.replace(/\bcape town\b/gi, "").replace(/\s+/g, " ").trim();

  let out = cleanPrimaryKeyword(phrase);
  if (!out) {
    out = cleanPrimaryKeyword(slug.replace(/-/g, " "));
  }
  return out.slice(0, 120);
}

function deriveSecondaryKeywords(primary: string, title: string, slug: string, area: string | null): string[] {
  const out: string[] = [];
  const core = primary.replace(/\bprice\b/gi, "").trim() || title.slice(0, 60).toLowerCase();

  if (area) {
    out.push(`house cleaning ${area}`);
    out.push(`cleaners near me ${area}`);
    out.push(`cleaning services ${area}`);
    const svc = slug.match(/^([a-z]+(?:-[a-z]+)?)-(?:cleaning|services)/);
    if (svc) {
      out.push(`${svc[1].replace(/-/g, " ")} ${area}`);
    }
  } else {
    out.push(`home cleaning cape town`);
    out.push(`professional ${core.split(/\s+/).slice(0, 5).join(" ")}`);
    out.push(`cleaning services cape town`);
  }

  const seen = new Set<string>();
  const uniq = out.map((s) => s.replace(/\s+/g, " ").trim()).filter((s) => {
    if (s.length < 8 || seen.has(s)) return false;
    seen.add(s);
    return true;
  });

  return uniq.slice(0, 4);
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY;
  if (!url?.trim() || !key?.trim()) {
    console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
    process.exit(1);
  }

  const admin = createClient(url, key, { auth: { persistSession: false } });

  const { data: rows, error } = await admin
    .from("blog_posts")
    .select("id,slug,title,h1,primary_keyword,secondary_keywords,search_intent");

  if (error) {
    console.error(error.message);
    process.exit(1);
  }

  let updated = 0;
  let skipped = 0;
  const samples: { id: string; slug: string; patch: Record<string, unknown> }[] = [];
  const skippedReasons: { slug: string; reason: string }[] = [];

  for (const r of (rows ?? []) as Row[]) {
    const needsPk = r.primary_keyword == null || String(r.primary_keyword).trim() === "";
    const needsSec = r.secondary_keywords == null;
    const needsIntent = r.search_intent == null || String(r.search_intent).trim() === "";

    if (!needsPk && !needsSec && !needsIntent) {
      skipped += 1;
      skippedReasons.push({ slug: r.slug, reason: "already_complete" });
      continue;
    }

    const displayTitle = r.title?.trim() || r.slug;
    const displayH1 = r.h1?.trim() || null;
    const area = findAreaHint(r.slug, displayTitle, displayH1);

    const primary = needsPk ? derivePrimaryKeyword(displayTitle, displayH1, r.slug) : String(r.primary_keyword);
    const secondary = needsSec ? deriveSecondaryKeywords(primary, displayTitle, r.slug, area) : r.secondary_keywords;
    const intent = needsIntent ? inferSearchIntent(displayTitle, r.slug, displayH1) : r.search_intent;

    const patch: Record<string, unknown> = {};
    if (needsPk) patch.primary_keyword = primary;
    if (needsSec) patch.secondary_keywords = secondary;
    if (needsIntent) patch.search_intent = intent;

    if (Object.keys(patch).length === 0) {
      skipped += 1;
      skippedReasons.push({ slug: r.slug, reason: "no_patch" });
      continue;
    }

    if (dryRun) {
      updated += 1;
      if (samples.length < 8) samples.push({ id: r.id, slug: r.slug, patch });
      continue;
    }

    const { error: upErr } = await admin.from("blog_posts").update(patch).eq("id", r.id);
    if (upErr) {
      skipped += 1;
      skippedReasons.push({ slug: r.slug, reason: upErr.message });
      continue;
    }

    updated += 1;
    if (samples.length < 8) samples.push({ id: r.id, slug: r.slug, patch });
  }

  console.log(
    JSON.stringify(
      {
        dryRun,
        updated,
        skipped,
        totalRows: (rows ?? []).length,
        sampleUpdates: samples,
        skippedPosts: skippedReasons.slice(0, 30),
        skippedTotal: skippedReasons.length,
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
