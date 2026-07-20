import sanitizeHtml from "sanitize-html";

/**
 * Sanitizer for admin-authored campaign `terms_html` (MKT-001A / WS2).
 *
 * `terms_html` is rendered via `dangerouslySetInnerHTML` on the PUBLIC campaign
 * landing page, so it must never carry executable or unsafe markup. We apply a
 * deliberately minimal allowlist (basic block/inline formatting + safe links)
 * using the maintained `sanitize-html` library — no homegrown regex stripping.
 *
 * Defense in depth: sanitize on write (before persisting) AND on render.
 */

const ALLOWED_TAGS = [
  "p",
  "br",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "ul",
  "ol",
  "li",
  "a",
  "span",
];

const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: ALLOWED_TAGS,
  allowedAttributes: {
    a: ["href", "rel", "target"],
    span: ["class"],
    p: ["class"],
  },
  // Safe URL schemes only — javascript:, data:, vbscript: and friends are dropped.
  allowedSchemes: ["http", "https", "mailto", "tel"],
  allowedSchemesByTag: { a: ["http", "https", "mailto", "tel"] },
  allowProtocolRelative: false,
  // Disallow all styles (blocks CSS-based injection) and any framing/embedding.
  allowedStyles: {},
  disallowedTagsMode: "discard",
  transformTags: {
    // Force external links to open safely and drop referrer/opener abuse.
    a: (_tagName, attribs) => {
      const href = typeof attribs.href === "string" ? attribs.href : "";
      return {
        tagName: "a",
        attribs: {
          ...attribs,
          ...(href ? { href } : {}),
          rel: "nofollow noopener noreferrer",
          target: "_blank",
        },
      };
    },
  },
};

/**
 * Sanitize campaign terms HTML. Returns a safe subset. `null`/empty input yields
 * an empty string. Never throws.
 */
export function sanitizeCampaignTermsHtml(html: string | null | undefined): string {
  if (!html) return "";
  try {
    return sanitizeHtml(html, SANITIZE_OPTIONS).trim();
  } catch {
    return "";
  }
}
