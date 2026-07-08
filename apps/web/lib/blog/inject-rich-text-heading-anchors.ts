export type RichTextHeadingTocEntry = {
  id: string;
  label: string;
  level: 2 | 3;
};

/** Safe fragment for use inside generated heading `id` attributes. */
function safeScopeSegment(scope: string): string {
  const t = scope.trim().replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-|-$/g, "");
  return t.length > 0 ? t.slice(0, 96) : "rt";
}

function stripInnerHtmlToText(inner: string): string {
  return inner.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function extractIdFromAttrs(attrs: string): string | null {
  const m = attrs.match(/\bid\s*=\s*(["'])([^"']*)\1/i);
  return m?.[2]?.trim() ? m[2].trim() : null;
}

function escapeAttrValue(v: string): string {
  return v.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

/**
 * Ensures every `h2` / `h3` in sanitized rich HTML has a stable `id`, and returns matching TOC rows
 * (`id`, `label`, `level`). Must use the same `scope` string as `BlogContentRenderer` and `extractTocFromBlogBlocks`.
 */
export function injectRichTextHeadingAnchors(
  sanitizedHtml: string,
  scope: string,
): { html: string; entries: RichTextHeadingTocEntry[] } {
  const entries: RichTextHeadingTocEntry[] = [];
  const safeScope = safeScopeSegment(scope);
  const re = /<h([234])((?:\s[^>]*)?)>([\s\S]*?)<\/h\1>/gi;
  let gen = 0;
  let out = "";
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sanitizedHtml)) !== null) {
    const levelNum = m[1];
    const isTocHeading = levelNum === "2" || levelNum === "3";
    const level: 2 | 3 = levelNum === "3" ? 3 : 2;
    const attrs = m[2] ?? "";
    const inner = m[3] ?? "";
    const label = stripInnerHtmlToText(inner) || `Section ${gen + 1}`;

    out += sanitizedHtml.slice(last, m.index);

    const existingId = extractIdFromAttrs(attrs);
    if (existingId) {
      if (isTocHeading) entries.push({ id: existingId, label, level });
      out += m[0];
    } else {
      const id = `blog-rich-${safeScope}-${gen}`;
      gen += 1;
      if (isTocHeading) entries.push({ id, label, level });
      out += `<h${levelNum}${attrs} id="${escapeAttrValue(id)}">${inner}</h${levelNum}>`;
    }
    last = re.lastIndex;
  }
  out += sanitizedHtml.slice(last);
  return { html: out, entries };
}
