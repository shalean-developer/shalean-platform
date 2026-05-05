import type { BlogContentBlock, BlogContentJson } from "@/lib/blog/content-json";
import { computeReadingTimeMinutes } from "@/lib/blog/compute-reading-time";
import { plainTextFromHtml } from "@/lib/blog/html-plain-text";

const MIN_WORDS_PUBLISH = 800;

function wc(s: string): number {
  const t = s.trim();
  if (!t) return 0;
  return t.split(/\s+/).length;
}

export function countWordsInContent(content: BlogContentJson): number {
  const blocks = Array.isArray(content.blocks) ? content.blocks : [];
  let n = 0;
  for (const b of blocks) {
    n += blockWords(b);
  }
  return n;
}

function extractHrefsFromHtml(html: string): string[] {
  const out: string[] = [];
  const re = /href\s*=\s*(["'])([^"']*)\1/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    out.push(m[2]);
  }
  return out;
}

/** Markdown-style `[label](url)` in legacy `paragraph` blocks (CMS / seeds). */
function extractMarkdownLinks(text: string): string[] {
  const out: string[] = [];
  const re = /\[([^\]]+)\]\(([^)]+)\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    out.push(m[2]);
  }
  return out;
}

function blockWords(b: BlogContentBlock): number {
  switch (b.type) {
    case "intro":
    case "quick_answer":
    case "paragraph":
      return wc(b.content);
    case "rich_text":
      return wc(plainTextFromHtml(b.html));
    case "heading":
      return wc(b.content);
    case "section":
      return wc(b.title) + wc(b.content);
    case "comparison":
      return b.items.reduce((acc, i) => acc + wc(i.label) + wc(i.value), 0);
    case "bullets":
      return (b.title ? wc(b.title) : 0) + b.items.reduce((acc, i) => acc + wc(i), 0);
    case "bullet_list":
    case "numbered_list":
      return (b.title ? wc(b.title) : 0) + b.items.reduce((acc, i) => acc + wc(i), 0);
    case "key_takeaways":
      return b.items.reduce((acc, i) => acc + wc(i), 0);
    case "cta":
      return wc(b.title) + wc(b.button_text) + wc(b.description ?? "") + wc(b.link);
    case "faq":
      return b.items.reduce((acc, i) => acc + wc(i.question) + wc(i.answer), 0);
    case "image":
      return wc(b.alt) + wc(b.caption ?? "");
    case "quote":
      return wc(b.content) + wc(b.attribution ?? "");
    case "internal_links":
      return (b.title ? wc(b.title) : 0) + b.links.reduce((acc, l) => acc + wc(l.label), 0);
    case "comparison_table":
      return (
        b.columns.reduce((acc, c) => acc + wc(c), 0) +
        b.rows.reduce((nr, row) => nr + row.reduce((acc, c) => acc + wc(c), 0), 0)
      );
    case "service_area":
      return b.locations.reduce((acc, l) => acc + wc(l), 0);
    default:
      return 0;
  }
}

export type PublishValidationIssue = {
  code: string;
  message: string;
};

export type PublishValidationResult = {
  ok: boolean;
  issues: PublishValidationIssue[];
  seoScore: number;
  wordCount: number;
  hasH2Section: boolean;
  hasFaq: boolean;
  hasCta: boolean;
  hasInternalLinks: boolean;
  hasBookingLink: boolean;
};

function normPath(u: string): string {
  try {
    const path = u.startsWith("http") ? new URL(u).pathname : u.split("?")[0] ?? u;
    return path.replace(/\/+$/, "") || "/";
  } catch {
    return u;
  }
}

function hasBookingPath(blocks: BlogContentBlock[]): boolean {
  for (const b of blocks) {
    if (b.type === "cta") {
      const p = normPath(b.link);
      if (p === "/booking" || p.startsWith("/booking")) return true;
    }
    if (b.type === "internal_links" && Array.isArray(b.links)) {
      for (const l of b.links) {
        const p = normPath(String(l?.url ?? ""));
        if (p === "/booking" || p.startsWith("/booking")) return true;
      }
    }
    if (b.type === "rich_text") {
      for (const h of extractHrefsFromHtml(b.html)) {
        const p = normPath(h);
        if (p === "/booking" || p.startsWith("/booking")) return true;
      }
    }
  }
  return false;
}

function collectInternalPaths(blocks: BlogContentBlock[]): string[] {
  const out: string[] = [];
  for (const b of blocks) {
    if (b.type === "internal_links" && Array.isArray(b.links)) {
      for (const l of b.links) out.push(normPath(String(l?.url ?? "")));
    }
    if (b.type === "rich_text") {
      for (const h of extractHrefsFromHtml(b.html)) out.push(normPath(h));
    }
    if (b.type === "paragraph") {
      for (const h of extractMarkdownLinks(b.content)) out.push(normPath(h));
    }
  }
  return out;
}

export function validateBlogPublish(content: BlogContentJson): PublishValidationResult {
  const words = countWordsInContent(content);
  const issues: PublishValidationIssue[] = [];
  const blocks = Array.isArray(content.blocks) ? content.blocks : [];

  const hasH2Section = blocks.some((b) => {
    if (b.type === "section") {
      return (b.heading_level ?? 2) <= 2 && b.title.trim().length > 0;
    }
    if (b.type === "heading") {
      return b.level === 2 && b.content.trim().length > 0;
    }
    if (b.type === "rich_text") {
      return /<h2\b/i.test(b.html);
    }
    return false;
  });
  const hasFaq = blocks.some((b) => b.type === "faq" && Array.isArray(b.items) && b.items.length > 0);
  const hasCta = blocks.some((b) => b.type === "cta" && b.title.trim() && b.button_text.trim());
  const paths = collectInternalPaths(blocks);
  const hasInternalLinks = paths.some((p) => p.startsWith("/locations") || p.startsWith("/services") || p.startsWith("/blog"));
  const hasBookingLink = hasBookingPath(blocks);

  if (words < MIN_WORDS_PUBLISH) {
    issues.push({
      code: "min_words",
      message: `Content is too thin for publish (${words} words; minimum ${MIN_WORDS_PUBLISH}).`,
    });
  }
  if (!hasH2Section) {
    issues.push({ code: "h2_sections", message: "Add at least one section block with an H2 heading." });
  }
  if (!hasFaq) {
    issues.push({ code: "faq", message: "Add an FAQ block with at least one Q&A pair." });
  }
  if (!hasCta) {
    issues.push({ code: "cta", message: "Add a CTA block (e.g. Book a cleaner → /booking)." });
  }
  if (!hasInternalLinks) {
    issues.push({
      code: "internal_links",
      message: "Include internal links to locations, services, or related blog posts (internal_links block or injected links).",
    });
  }
  if (!hasBookingLink) {
    issues.push({
      code: "booking_link",
      message: "Include a booking link (/booking) in a CTA or internal_links block.",
    });
  }

  let score = 100;
  score -= words < MIN_WORDS_PUBLISH ? 25 : 0;
  score -= !hasH2Section ? 10 : 0;
  score -= !hasFaq ? 10 : 0;
  score -= !hasCta ? 10 : 0;
  score -= !hasInternalLinks ? 15 : 0;
  score -= !hasBookingLink ? 10 : 0;
  score = Math.max(0, Math.min(100, score));

  return {
    ok: issues.length === 0,
    issues,
    seoScore: score,
    wordCount: words,
    hasH2Section,
    hasFaq,
    hasCta,
    hasInternalLinks,
    hasBookingLink,
  };
}

export { MIN_WORDS_PUBLISH };

/** Lightweight score for drafts (reading-time based proxy when word count not computed client-side). */
export function estimateSeoScoreFromContent(content: BlogContentJson): number {
  const rt = computeReadingTimeMinutes(content);
  const wordsApprox = rt * 200;
  const v = validateBlogPublish(content);
  let s = v.seoScore;
  if (wordsApprox < MIN_WORDS_PUBLISH && v.wordCount === 0) {
    s -= 5;
  }
  return Math.max(0, Math.min(100, s));
}
