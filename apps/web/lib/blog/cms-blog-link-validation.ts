import type { SupabaseClient } from "@supabase/supabase-js";
import type { BlogContentBlock, BlogContentJson } from "@/lib/blog/content-json";
import {
  blogSlugFromPathname,
  getCanonicalBlogSlug,
  getCanonicalBlogRoute,
  isRedirectAliasBlogSlug,
  isRoutableBlogSlug,
  normalizeBlogHref,
} from "@/lib/blog/validBlogRoutes";

/** Extracted internal blog target for governance / CI. */
export type BrokenCmsBlogLink = {
  sourcePostSlug: string;
  brokenHref: string;
  normalizedSlug: string;
  fieldPath: string;
  issueType:
    | "missing-post"
    | "redirect-alias"
    | "unpublished"
    | "bad-canonical"
    | "external-host"
    | "malformed-url";
  recommendedFix: string;
};

export type CmsBlogLinkOccurrence = {
  fieldPath: string;
  rawHref: string;
};

function isShaleanMarketingHostname(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === "localhost" || h.startsWith("127.0.0.1")) return true;
  const strip = h.replace(/^www\./, "");
  return strip === "shalean.co.za" || strip === "shalean.com";
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

function extractMarkdownLinks(text: string): string[] {
  const out: string[] = [];
  const re = /\[([^\]]+)\]\(([^)]+)\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    out.push(m[2]);
  }
  return out;
}

function pushOccurrences(out: CmsBlogLinkOccurrence[], fieldPath: string, hrefs: readonly string[]) {
  for (const h of hrefs) {
    const t = String(h).trim();
    if (t) out.push({ fieldPath, rawHref: t });
  }
}

/**
 * Collect every raw `href`-like string from `content_json` that might point at `/blog/*`
 * (rich text, markdown-ish blocks, CTA, internal_links, FAQ answers).
 */
export function extractInternalBlogHrefsFromContentJson(content: BlogContentJson): CmsBlogLinkOccurrence[] {
  const out: CmsBlogLinkOccurrence[] = [];
  const blocks = Array.isArray(content.blocks) ? content.blocks : [];
  blocks.forEach((b, i) => {
    const prefix = `blocks[${i}].${b.type}`;
    switch (b.type) {
      case "rich_text":
        pushOccurrences(out, `${prefix}.html`, extractHrefsFromHtml(b.html));
        break;
      case "paragraph":
        pushOccurrences(out, `${prefix}.content`, extractMarkdownLinks(b.content));
        pushOccurrences(out, `${prefix}.content`, extractHrefsFromHtml(b.content));
        break;
      case "intro":
      case "quick_answer":
        pushOccurrences(out, `${prefix}.content`, extractMarkdownLinks(b.content));
        pushOccurrences(out, `${prefix}.content`, extractHrefsFromHtml(b.content));
        break;
      case "section":
        pushOccurrences(out, `${prefix}.content`, extractMarkdownLinks(b.content));
        pushOccurrences(out, `${prefix}.content`, extractHrefsFromHtml(b.content));
        break;
      case "cta":
        pushOccurrences(out, `${prefix}.link`, [b.link]);
        break;
      case "internal_links":
        if (Array.isArray(b.links)) {
          b.links.forEach((l, j) => {
            pushOccurrences(out, `${prefix}.links[${j}].url`, [String(l?.url ?? "")]);
          });
        }
        break;
      case "faq":
        if (Array.isArray(b.items)) {
          b.items.forEach((it, j) => {
            pushOccurrences(out, `${prefix}.items[${j}].question`, extractHrefsFromHtml(it.question));
            pushOccurrences(out, `${prefix}.items[${j}].answer`, extractHrefsFromHtml(it.answer));
            pushOccurrences(out, `${prefix}.items[${j}].answer`, extractMarkdownLinks(it.answer));
          });
        }
        break;
      case "bullets":
      case "bullet_list":
      case "numbered_list":
        if ("items" in b && Array.isArray(b.items)) {
          b.items.forEach((item, j) => {
            pushOccurrences(out, `${prefix}.items[${j}]`, extractMarkdownLinks(item));
            pushOccurrences(out, `${prefix}.items[${j}]`, extractHrefsFromHtml(item));
          });
        }
        break;
      case "key_takeaways":
        b.items.forEach((item, j) => {
          pushOccurrences(out, `${prefix}.items[${j}]`, extractMarkdownLinks(item));
          pushOccurrences(out, `${prefix}.items[${j}]`, extractHrefsFromHtml(item));
        });
        break;
      default:
        break;
    }
  });
  return out;
}

export type ParsedInternalBlogHref =
  | { kind: "not_blog_internal" }
  | { kind: "malformed"; detail: string }
  | { kind: "external_host"; host: string }
  | { kind: "blog_path"; initialPath: string; initialSlug: string | null };

/**
 * Parse href — only follows Shalean marketing hosts. Other http(s) URLs are ignored (not internal blog).
 */
export function parseInternalBlogHref(rawHref: string): ParsedInternalBlogHref {
  const raw = rawHref.trim();
  if (!raw || raw.startsWith("#") || /^mailto:/i.test(raw) || /^tel:/i.test(raw)) {
    return { kind: "not_blog_internal" };
  }

  try {
    if (raw.startsWith("http://") || raw.startsWith("https://")) {
      const u = new URL(raw);
      if (!isShaleanMarketingHostname(u.hostname)) {
        if (u.pathname.includes("/blog/")) {
          return { kind: "external_host", host: u.hostname };
        }
        return { kind: "not_blog_internal" };
      }
      const path = u.pathname.split(/[?#]/)[0] ?? u.pathname;
      if (!path.startsWith("/blog/")) return { kind: "not_blog_internal" };
      const slug = blogSlugFromPathname(path);
      if (!slug) return { kind: "malformed", detail: "empty blog slug" };
      return { kind: "blog_path", initialPath: path, initialSlug: slug };
    }
    const pathOnly = raw.split(/[?#]/)[0] ?? raw;
    if (!pathOnly.startsWith("/blog/")) return { kind: "not_blog_internal" };
    const slug = blogSlugFromPathname(pathOnly.startsWith("/") ? pathOnly : `/${pathOnly}`);
    if (!slug) return { kind: "malformed", detail: "empty blog slug" };
    return { kind: "blog_path", initialPath: pathOnly.startsWith("/") ? pathOnly : `/${pathOnly}`, initialSlug: slug };
  } catch {
    return { kind: "malformed", detail: "URL parse error" };
  }
}

export type InternalBlogLinkValidationContext = {
  publishedSlugSet: ReadonlySet<string>;
  /** Slug of the post being validated (self-links to the same slug are allowed). */
  currentSlug?: string;
};

/**
 * Validate a single normalized blog slug (after `normalizeBlogHref` + redirect resolution to a `/blog/*` path).
 * Returns ok when the target would 200 for a public visitor.
 */
export function validateInternalBlogLinkTarget(
  finalBlogSlug: string,
  ctx: InternalBlogLinkValidationContext,
): { ok: true } | { ok: false; issueType: BrokenCmsBlogLink["issueType"] } {
  const s = finalBlogSlug.trim().toLowerCase();
  if (!s) return { ok: false, issueType: "malformed-url" };
  if (isRedirectAliasBlogSlug(s)) {
    return { ok: false, issueType: "redirect-alias" };
  }
  const self = ctx.currentSlug?.trim().toLowerCase();
  if (self && s === self) {
    return { ok: true };
  }
  if (isRoutableBlogSlug(s, { dbPublishedSlugs: ctx.publishedSlugSet })) {
    return { ok: true };
  }
  return { ok: false, issueType: "missing-post" };
}

/** Safe auto-normalization hint (no DB writes). */
export function suggestNormalizedBlogHref(rawHref: string): string {
  return normalizeBlogHref(rawHref.trim());
}

function validateBlogHrefOccurrence(
  sourcePostSlug: string,
  occ: CmsBlogLinkOccurrence,
  ctx: InternalBlogLinkValidationContext,
): BrokenCmsBlogLink | null {
  const parsed = parseInternalBlogHref(occ.rawHref);
  if (parsed.kind === "not_blog_internal") return null;
  if (parsed.kind === "malformed") {
    return {
      sourcePostSlug,
      brokenHref: occ.rawHref,
      normalizedSlug: "",
      fieldPath: occ.fieldPath,
      issueType: "malformed-url",
      recommendedFix: "Fix or remove the malformed URL.",
    };
  }
  if (parsed.kind === "external_host") {
    return {
      sourcePostSlug,
      brokenHref: occ.rawHref,
      normalizedSlug: blogSlugFromPathname(new URL(occ.rawHref).pathname) ?? "",
      fieldPath: occ.fieldPath,
      issueType: "external-host",
      recommendedFix: "Use a relative path on shalean.co.za (e.g. /blog/my-slug) or remove off-site blog URLs.",
    };
  }

  const initialSlug = parsed.initialSlug;
  if (initialSlug && isRedirectAliasBlogSlug(initialSlug)) {
    const canon = getCanonicalBlogRoute(initialSlug);
    return {
      sourcePostSlug,
      brokenHref: occ.rawHref,
      normalizedSlug: getCanonicalBlogSlug(initialSlug),
      fieldPath: occ.fieldPath,
      issueType: "redirect-alias",
      recommendedFix: `Replace with canonical target ${canon} (redirect-only slug must not be linked directly).`,
    };
  }

  const normalizedFull = normalizeBlogHref(occ.rawHref);
  const pathOnly = normalizedFull.split(/[?#]/)[0] ?? normalizedFull;
  if (!pathOnly.startsWith("/blog")) {
    /* Redirected to commercial / locations — not a broken blog target */
    return null;
  }
  const finalSlug = blogSlugFromPathname(pathOnly);
  if (!finalSlug) {
    return {
      sourcePostSlug,
      brokenHref: occ.rawHref,
      normalizedSlug: "",
      fieldPath: occ.fieldPath,
      issueType: "malformed-url",
      recommendedFix: "Fix the /blog path (missing slug segment).",
    };
  }

  const check = validateInternalBlogLinkTarget(finalSlug, ctx);
  if (check.ok) return null;

  const fix =
    check.issueType === "redirect-alias"
      ? `Use ${getCanonicalBlogRoute(finalSlug)}`
      : `Publish a post at /blog/${finalSlug}, add it to routed templates, or link to a live service/location URL instead.`;

  return {
    sourcePostSlug,
    brokenHref: occ.rawHref,
    normalizedSlug: finalSlug,
    fieldPath: occ.fieldPath,
    issueType: check.issueType,
    recommendedFix: fix,
  };
}

export async function fetchPublishedBlogSlugSet(admin: SupabaseClient): Promise<Set<string>> {
  const nowIso = new Date().toISOString();
  const { data, error } = await admin
    .from("blog_posts")
    .select("slug")
    .eq("status", "published")
    .lte("published_at", nowIso)
    .not("content_json", "is", null);

  if (error || !data) return new Set();
  const set = new Set<string>();
  for (const row of data as { slug?: string }[]) {
    const s = String(row.slug ?? "").trim().toLowerCase();
    if (s) set.add(s);
  }
  return set;
}

export function validateCanonicalUrlField(
  sourcePostSlug: string,
  canonicalUrl: string | null | undefined,
  ctx: InternalBlogLinkValidationContext,
): BrokenCmsBlogLink | null {
  const raw = canonicalUrl == null ? "" : String(canonicalUrl).trim();
  if (!raw) return null;

  try {
    if (raw.startsWith("http://") || raw.startsWith("https://")) {
      const u = new URL(raw);
      if (!isShaleanMarketingHostname(u.hostname)) {
        return {
          sourcePostSlug,
          brokenHref: raw,
          normalizedSlug: "",
          fieldPath: "canonical_url",
          issueType: "bad-canonical",
          recommendedFix: "Use https://shalean.co.za/... or a relative /blog/... path on the apex host.",
        };
      }
      const path = u.pathname.split(/[?#]/)[0] ?? u.pathname;
      if (!path.startsWith("/blog/")) return null;
      const slug = blogSlugFromPathname(path);
      if (!slug) {
        return {
          sourcePostSlug,
          brokenHref: raw,
          normalizedSlug: "",
          fieldPath: "canonical_url",
          issueType: "bad-canonical",
          recommendedFix: "Set canonical_url to a valid /blog/{slug} path.",
        };
      }
      const v = validateInternalBlogLinkTarget(slug, ctx);
      if (v.ok) return null;
      return {
        sourcePostSlug,
        brokenHref: raw,
        normalizedSlug: slug,
        fieldPath: "canonical_url",
        issueType: v.issueType === "redirect-alias" ? "redirect-alias" : "bad-canonical",
        recommendedFix:
          v.issueType === "redirect-alias"
            ? `Use ${getCanonicalBlogRoute(slug)}`
            : "Point canonical_url at this post's live URL or another published /blog slug.",
      };
    }
    const path = raw.split(/[?#]/)[0] ?? raw;
    const withSlash = path.startsWith("/") ? path : `/${path}`;
    if (!withSlash.startsWith("/blog/")) return null;
    const slug = blogSlugFromPathname(withSlash);
    if (!slug) {
      return {
        sourcePostSlug,
        brokenHref: raw,
        normalizedSlug: "",
        fieldPath: "canonical_url",
        issueType: "bad-canonical",
        recommendedFix: "Use /blog/{slug} with a valid slug.",
      };
    }
    const v = validateInternalBlogLinkTarget(slug, ctx);
    if (v.ok) return null;
    return {
      sourcePostSlug,
      brokenHref: raw,
      normalizedSlug: slug,
      fieldPath: "canonical_url",
      issueType: v.issueType === "redirect-alias" ? "redirect-alias" : "bad-canonical",
      recommendedFix:
        v.issueType === "redirect-alias" ? `Use ${getCanonicalBlogRoute(slug)}` : "Fix canonical_url to a routable blog slug.",
    };
  } catch {
    return {
      sourcePostSlug,
      brokenHref: raw,
      normalizedSlug: "",
      fieldPath: "canonical_url",
      issueType: "malformed-url",
      recommendedFix: "canonical_url must be a valid absolute URL or path.",
    };
  }
}

export function validateRelatedGuideOverrideSlugs(
  sourcePostSlug: string,
  overrides: string[] | null | undefined,
  ctx: InternalBlogLinkValidationContext,
): BrokenCmsBlogLink[] {
  const out: BrokenCmsBlogLink[] = [];
  if (!overrides?.length) return out;
  overrides.forEach((raw, i) => {
    const s = String(raw).trim().toLowerCase();
    if (!s) return;
    if (isRedirectAliasBlogSlug(s)) {
      out.push({
        sourcePostSlug,
        brokenHref: raw,
        normalizedSlug: getCanonicalBlogSlug(s),
        fieldPath: `related_guide_override_slugs[${i}]`,
        issueType: "redirect-alias",
        recommendedFix: `Use canonical slug ${getCanonicalBlogSlug(s)} (not redirect-only alias).`,
      });
      return;
    }
    const canon = getCanonicalBlogSlug(s);
    const v = validateInternalBlogLinkTarget(canon, ctx);
    if (!v.ok) {
      out.push({
        sourcePostSlug,
        brokenHref: raw,
        normalizedSlug: canon,
        fieldPath: `related_guide_override_slugs[${i}]`,
        issueType: v.issueType === "redirect-alias" ? "redirect-alias" : "missing-post",
        recommendedFix: "Override must reference a published routable blog slug.",
      });
    }
  });
  return out;
}

export type CmsBlogDocumentInput = {
  slug: string;
  content: BlogContentJson;
  canonical_url?: string | null;
  related_guide_override_slugs?: string[] | null;
};

/**
 * Full validation for one post (content + canonical + overrides).
 */
export function validateCmsBlogDocument(
  input: CmsBlogDocumentInput,
  publishedSlugSet: ReadonlySet<string>,
): BrokenCmsBlogLink[] {
  const ctx: InternalBlogLinkValidationContext = {
    publishedSlugSet,
    currentSlug: input.slug.trim().toLowerCase(),
  };
  const broken: BrokenCmsBlogLink[] = [];
  const seen = new Set<string>();

  const push = (b: BrokenCmsBlogLink | null) => {
    if (!b) return;
    const key = `${b.fieldPath}\0${b.brokenHref}\0${b.issueType}`;
    if (seen.has(key)) return;
    seen.add(key);
    broken.push(b);
  };

  for (const occ of extractInternalBlogHrefsFromContentJson(input.content)) {
    push(validateBlogHrefOccurrence(input.slug, occ, ctx));
  }
  push(validateCanonicalUrlField(input.slug, input.canonical_url, ctx));
  for (const b of validateRelatedGuideOverrideSlugs(input.slug, input.related_guide_override_slugs, ctx)) {
    push(b);
  }

  return broken;
}

/** Include the post being saved so self-`/blog/{slug}` references validate once the slug is published. */
export function buildPublishedSlugSetForCmsValidation(
  base: ReadonlySet<string>,
  provisionalSlug?: string,
): Set<string> {
  const s = new Set(base);
  const p = provisionalSlug?.trim().toLowerCase();
  if (p) s.add(p);
  return s;
}

export type CmsBlogSaveStatus = "draft" | "published" | "scheduled";

/**
 * Admin save path: skip drafts; for published/scheduled require all internal `/blog/*` targets to be routable.
 */
export async function validateCmsBlogLinksForAdminSave(
  admin: SupabaseClient,
  input: CmsBlogDocumentInput & { status: CmsBlogSaveStatus },
): Promise<BrokenCmsBlogLink[]> {
  if (input.status === "draft") return [];
  const base = await fetchPublishedBlogSlugSet(admin);
  const set = buildPublishedSlugSetForCmsValidation(base, input.slug);
  return validateCmsBlogDocument(input, set);
}
