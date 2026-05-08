import {
  blogSlugFromPathname,
  DEV_BLOG_STATIC_LINK_ALLOWLIST,
  isRedirectAliasBlogSlug,
  normalizeBlogHref,
} from "@/lib/blog/validBlogRoutes";

export type EditorialLinkIssueKind =
  | "redirect_alias"
  | "non_canonical_blog_href"
  | "unknown_static_blog_slug"
  | "malformed_href";

export type EditorialLinkIssue = {
  kind: EditorialLinkIssueKind;
  raw: string;
  /** Present when a deterministic canonical suggestion exists */
  suggestedHref?: string;
  message: string;
};

export type ValidateEditorialContentLinksOptions = {
  /** When true, rewrite redirect-alias targets to canonical paths in returned fixedHtml/fixedMarkdown */
  autoFixLegacySlugs?: boolean;
  /** When true, flag internal `/blog/*` slugs absent from static dev allowlist (noisy for CMS-only posts). */
  strictStaticAllowlist?: boolean;
};

export type ValidateEditorialContentLinksResult = {
  issues: EditorialLinkIssue[];
  fixedHtml?: string;
  fixedMarkdown?: string;
};

function pushIssue(list: EditorialLinkIssue[], issue: EditorialLinkIssue): void {
  list.push(issue);
}

/** Extract href-like targets from TipTap-ish JSON (recursively finds string values for keys `href` or `link`). */
export function extractHrefsFromTipTapJson(json: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const walk = (v: unknown): void => {
    if (v == null) return;
    if (typeof v === "string") return;
    if (Array.isArray(v)) {
      for (const x of v) walk(x);
      return;
    }
    if (typeof v !== "object") return;
    const o = v as Record<string, unknown>;
    const href = o.href;
    if (typeof href === "string" && href.trim()) {
      const t = href.trim();
      if (!seen.has(t)) {
        seen.add(t);
        out.push(t);
      }
    }
    const link = o.link;
    if (link && typeof link === "object") {
      const h = (link as { href?: unknown }).href;
      if (typeof h === "string" && h.trim()) {
        const t = h.trim();
        if (!seen.has(t)) {
          seen.add(t);
          out.push(t);
        }
      }
    }
    for (const val of Object.values(o)) walk(val);
  };
  try {
    walk(JSON.parse(json) as unknown);
  } catch {
    /* ignore */
  }
  return out;
}

function classifyInternalBlogHref(raw: string, strictStaticAllowlist: boolean): EditorialLinkIssue | null {
  const t = raw.trim();
  if (!t || /^(mailto:|tel:|javascript:)/i.test(t)) return null;

  let pathOnly = t;
  try {
    if (t.startsWith("http://") || t.startsWith("https://")) {
      const u = new URL(t);
      const host = u.hostname.replace(/^www\./, "");
      if (host !== "shalean.co.za" && host !== "localhost" && !host.startsWith("127.0.0.1")) return null;
      pathOnly = u.pathname + u.search + u.hash;
    }
  } catch {
    return null;
  }

  const plainPath = pathOnly.split(/[?#]/)[0] ?? "";
  const slug = blogSlugFromPathname(plainPath);
  if (!slug) return null;

  if (isRedirectAliasBlogSlug(slug)) {
    const suggested = normalizeBlogHref(plainPath.startsWith("/blog/") ? plainPath : `/blog/${slug}`);
    return {
      kind: "redirect_alias",
      raw: t,
      suggestedHref: suggested !== t ? suggested : undefined,
      message: `Redirect-only blog slug "${slug}" must not be persisted; use canonical target.`,
    };
  }

  if (plainPath.startsWith("/blog/") && normalizeBlogHref(plainPath) !== plainPath) {
    const suggested = normalizeBlogHref(plainPath);
    return {
      kind: "non_canonical_blog_href",
      raw: t,
      suggestedHref: suggested,
      message: `Blog href normalizes to ${suggested}`,
    };
  }

  if (strictStaticAllowlist && !DEV_BLOG_STATIC_LINK_ALLOWLIST.has(slug)) {
    return {
      kind: "unknown_static_blog_slug",
      raw: t,
      message: `Slug "${slug}" is not in static dev allowlist (may still be CMS-valid).`,
    };
  }

  return null;
}

/**
 * Pre-ingestion validation for CMS HTML, markdown, or TipTap JSON strings.
 * Optionally returns fixed copies with canonical blog hrefs (does not guarantee HTML safety — pair with sanitize-html).
 */
export function validateEditorialContentLinks(
  input: { html?: string; markdown?: string; tiptapJson?: string },
  opts: ValidateEditorialContentLinksOptions = {},
): ValidateEditorialContentLinksResult {
  const issues: EditorialLinkIssue[] = [];
  const hrefs = new Set<string>();

  const grabFromHtml = (html: string): void => {
    const re = /\bhref\s*=\s*(["'])([^"']*)\1/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) {
      const h = m[2]?.trim();
      if (h) hrefs.add(h);
    }
  };

  const grabFromMd = (md: string): void => {
    const re = /\]\(([^)]+)\)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(md)) !== null) {
      const inner = String(m[1] ?? "").trim();
      if (inner) hrefs.add(inner.split(/\s+/)[0] ?? inner);
    }
  };

  if (input.html) grabFromHtml(input.html);
  if (input.markdown) grabFromMd(input.markdown);
  if (input.tiptapJson) {
    for (const h of extractHrefsFromTipTapJson(input.tiptapJson)) hrefs.add(h);
  }

  const strict = Boolean(opts.strictStaticAllowlist);

  for (const h of hrefs) {
    const issue = classifyInternalBlogHref(h, strict);
    if (issue) pushIssue(issues, issue);
  }

  let fixedHtml = input.html;
  let fixedMarkdown = input.markdown;
  if (opts.autoFixLegacySlugs && input.html) {
    fixedHtml = input.html.replace(/\bhref\s*=\s*(["'])([^"']*)\1/gi, (_f, q: string, raw: string) => {
      const issue = classifyInternalBlogHref(raw, strict);
      if (issue?.suggestedHref) return `href=${q}${issue.suggestedHref}${q}`;
      const n = normalizeBlogHref(raw);
      return `href=${q}${n}${q}`;
    });
  }
  if (opts.autoFixLegacySlugs && input.markdown) {
    fixedMarkdown = input.markdown.replace(/\]\(([^)]+)\)/g, (full, inner: string) => {
      const raw = String(inner).trim();
      const target = raw.split(/\s+/)[0] ?? raw;
      const issue = classifyInternalBlogHref(target, strict);
      if (issue?.suggestedHref) return `](${issue.suggestedHref})`;
      const n = normalizeBlogHref(target);
      return n !== target ? `](${n})` : full;
    });
  }

  return {
    issues,
    fixedHtml,
    fixedMarkdown,
  };
}
