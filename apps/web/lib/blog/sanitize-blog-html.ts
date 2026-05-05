import sanitizeHtml from "sanitize-html";

const ALLOWED_TAGS = [
  "p",
  "br",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "a",
  "h2",
  "h3",
  "ul",
  "ol",
  "li",
  "span",
];

const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: ALLOWED_TAGS,
  allowedAttributes: {
    a: ["href", "class", "rel", "target"],
    "*": ["class"],
  },
  allowedSchemes: ["http", "https", "mailto", "tel"],
  allowProtocolRelative: false,
};

/**
 * Sanitize CMS-authored HTML before `dangerouslySetInnerHTML`.
 * Keeps a TipTap-friendly subset aligned with on-page SEO headings (h2–h3).
 *
 * Uses `sanitize-html` (no jsdom) so the Node/Vercel bundle avoids ESM/CJS
 * issues from `html-encoding-sniffer` → `@exodus/bytes`.
 */
export function sanitizeBlogRichHtml(html: string): string {
  try {
    return sanitizeHtml(html ?? "", SANITIZE_OPTIONS);
  } catch (err) {
    console.error("[blog] sanitizeBlogRichHtml failed (falling back to empty string)", err);
    return "";
  }
}
