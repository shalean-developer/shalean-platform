import sanitizeHtml from "sanitize-html";

import { isBlogMediaPublicUrl } from "@/lib/blog/blog-media-storage";

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
  "h4",
  "h1",
  "ul",
  "ol",
  "li",
  "span",
  "hr",
  "blockquote",
  "img",
  "table",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
];

function isAllowedBlogImageSrc(src: string): boolean {
  const t = src.trim();
  if (!t) return false;
  if (t.startsWith("/images/") || t.startsWith("/marketing/")) return true;
  if (isBlogMediaPublicUrl(t)) return true;
  try {
    const u = new URL(t);
    if (u.protocol !== "https:" && u.protocol !== "http:") return false;
    const host = u.hostname.toLowerCase();
    if (host === "images.unsplash.com") return true;
    const strip = host.replace(/^www\./, "");
    return strip === "shalean.co.za" || strip === "shalean.com";
  } catch {
    return false;
  }
}

const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: ALLOWED_TAGS,
  allowedAttributes: {
    a: ["href", "class", "rel", "target"],
    h2: ["id", "class"],
    h3: ["id", "class"],
    h4: ["id", "class"],
    h1: ["id", "class"],
    img: ["src", "alt", "title", "class", "loading", "width", "height"],
    blockquote: ["class"],
    "*": ["class"],
  },
  allowedSchemes: ["http", "https", "mailto", "tel"],
  allowProtocolRelative: false,
  transformTags: {
    img: (_tagName, attribs) => {
      const src = typeof attribs.src === "string" ? attribs.src : "";
      if (!isAllowedBlogImageSrc(src)) {
        return { tagName: "span", attribs: { class: "hidden" }, text: "" };
      }
      return {
        tagName: "img",
        attribs: {
          ...attribs,
          loading: attribs.loading === "eager" ? "eager" : "lazy",
          class: attribs.class ?? "blog-inline-image rounded-lg max-w-full h-auto my-6",
        },
      };
    },
  },
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
