import DOMPurify from "isomorphic-dompurify";

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

const ALLOWED_ATTR = ["href", "class", "rel", "target"];

/** Allowed URL schemes / relative paths for rich-text links. */
const ALLOWED_URI_REGEXP = /^(?:(?:https?):|mailto:|tel:|\/|#)/i;

/**
 * Sanitize CMS-authored HTML before `dangerouslySetInnerHTML`.
 * Keeps a TipTap-friendly subset aligned with on-page SEO headings (h2–h3).
 */
export function sanitizeBlogRichHtml(html: string): string {
  try {
    return DOMPurify.sanitize(html ?? "", {
      ALLOWED_TAGS,
      ALLOWED_ATTR,
      ALLOWED_URI_REGEXP,
    });
  } catch (err) {
    console.error("[blog] sanitizeBlogRichHtml failed (falling back to empty string)", err);
    return "";
  }
}
