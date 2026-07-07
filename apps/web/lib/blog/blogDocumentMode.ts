import type { BlogContentBlock } from "@/lib/blog/content-json";
import { legacyParagraphToRichHtml } from "@/lib/blog/legacy-paragraph-to-rich-html";

/** Blocks edited outside the main rich-text document. */
export const DOCUMENT_ADVANCED_BLOCK_TYPES = new Set([
  "faq",
  "cta",
  "internal_links",
  "image",
  "comparison_table",
  "comparison",
]);

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function proseBlockToHtml(block: BlogContentBlock): string {
  switch (block.type) {
    case "rich_text":
      return block.html?.trim() ? block.html : "";
    case "paragraph":
      return legacyParagraphToRichHtml(block.content);
    case "heading": {
      const level = Math.min(4, Math.max(1, block.level)) as 1 | 2 | 3 | 4;
      return block.content.trim() ? `<h${level}>${escapeHtml(block.content.trim())}</h${level}>` : "";
    }
    case "section": {
      const hl = block.heading_level ?? 2;
      const title = block.title.trim()
        ? `<h${hl}>${escapeHtml(block.title.trim())}</h${hl}>`
        : "";
      const body = block.content.trim() ? legacyParagraphToRichHtml(block.content) : "";
      return `${title}${body}`;
    }
    case "intro":
    case "quick_answer":
      return legacyParagraphToRichHtml(block.content);
    case "bullets":
    case "bullet_list":
    case "key_takeaways": {
      const title =
        block.type !== "key_takeaways" && block.title?.trim()
          ? `<p><strong>${escapeHtml(block.title.trim())}</strong></p>`
          : "";
      const items = block.items
        .map((item) => item.trim())
        .filter(Boolean)
        .map((item) => `<li>${escapeHtml(item)}</li>`)
        .join("");
      return items ? `${title}<ul>${items}</ul>` : title;
    }
    case "numbered_list": {
      const title = block.title?.trim()
        ? `<p><strong>${escapeHtml(block.title.trim())}</strong></p>`
        : "";
      const items = block.items
        .map((item) => item.trim())
        .filter(Boolean)
        .map((item) => `<li>${escapeHtml(item)}</li>`)
        .join("");
      return items ? `${title}<ol>${items}</ol>` : title;
    }
    case "quote": {
      const inner = block.content.trim();
      if (!inner) return "";
      const attr = block.attribution?.trim()
        ? `<footer>${escapeHtml(block.attribution.trim())}</footer>`
        : "";
      return `<blockquote><p>${escapeHtml(inner)}</p>${attr}</blockquote>`;
    }
    default:
      return "";
  }
}

export function proseBlocksToDocumentHtml(blocks: BlogContentBlock[]): string {
  const parts = blocks
    .filter((b) => !DOCUMENT_ADVANCED_BLOCK_TYPES.has(b.type))
    .map(proseBlockToHtml)
    .map((html) => html.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts.join("") : "<p></p>";
}

export function splitBlocksForDocumentMode(blocks: BlogContentBlock[]): {
  documentHtml: string;
  advancedBlocks: BlogContentBlock[];
} {
  const prose: BlogContentBlock[] = [];
  const advanced: BlogContentBlock[] = [];
  for (const block of blocks) {
    if (DOCUMENT_ADVANCED_BLOCK_TYPES.has(block.type)) advanced.push(block);
    else prose.push(block);
  }
  return {
    documentHtml: proseBlocksToDocumentHtml(prose),
    advancedBlocks: advanced,
  };
}

export function mergeDocumentModeToBlocks(
  documentHtml: string,
  advancedBlocks: BlogContentBlock[],
): BlogContentBlock[] {
  const trimmed = documentHtml.trim();
  const hasBody =
    trimmed.length > 0 &&
    trimmed !== "<p></p>" &&
    trimmed !== "<p><br></p>" &&
    trimmed !== "<p><br/></p>";
  const bodyBlocks: BlogContentBlock[] = hasBody
    ? [{ type: "rich_text", html: trimmed }]
    : [];
  return [...bodyBlocks, ...advancedBlocks];
}
