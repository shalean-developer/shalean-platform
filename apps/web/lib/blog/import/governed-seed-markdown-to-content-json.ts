/**
 * Converts governed seed `content_markdown` into canonical `BlogContentJson`
 * (rich_text HTML sanitized like production + comparison_table + faq + cta + internal_links).
 */

import {
  BLOG_CONTENT_JSON_SCHEMA_VERSION,
  type BlogContentBlock,
  type BlogContentJson,
  type BlogFaqItem,
} from "@/lib/blog/content-json";
import { sanitizeBlogRichHtml } from "@/lib/blog/sanitize-blog-html";

const FAQ_HEADING_RE = /\n##\s+(Frequently asked questions|FAQ)\b[^\n]*\n/i;
const END_CTA_HEADING_RE = /\n##\s+End CTA\b[^\n]*\n/i;
const RELATED_GUIDES_RE = /\n##\s+Related guides\b[\s\S]*$/i;

/** Slug → semantic_cluster (matches editorial seed slugs in JSON). */
export const GOVERNED_SEED_SLUG_SEMANTIC_CLUSTER: Record<string, string> = {
  "deep-vs-standard-cleaning-which-to-book-cape-town": "service-selection",
  "same-day-cleaning-cape-town": "service-selection",
  "whats-included-in-deep-cleaning-cape-town": "service-selection",
  "how-long-does-house-cleaning-take-cape-town": "service-selection",
  "once-off-vs-recurring-cleaning-cape-town": "service-selection",
  "how-to-prepare-home-before-cleaner-arrives-cape-town": "booking-confidence",
  "what-professional-cleaners-can-and-cannot-do-cape-town": "booking-confidence",
  "why-home-still-feels-dirty-after-cleaning-cape-town": "booking-confidence",
  "move-out-cleaning-checklist-cape-town-tenants": "move-out-authority",
  "how-often-should-you-deep-clean-your-home-cape-town": "service-selection",
};

const SEMANTIC_IN_NOTES_RE = /semantic_cluster\s*=\s*([a-z0-9-]+)/i;

export function resolveGovernedSeedSemanticCluster(
  slug: string,
  opts?: { explicit?: string | null; notes_for_editor?: string | null },
): string | null {
  const fromExplicit = (opts?.explicit ?? "").trim().toLowerCase();
  if (fromExplicit) return fromExplicit;
  const notes = opts?.notes_for_editor ?? "";
  const m = typeof notes === "string" ? notes.match(SEMANTIC_IN_NOTES_RE) : null;
  if (m?.[1]) return m[1].toLowerCase();
  return GOVERNED_SEED_SLUG_SEMANTIC_CLUSTER[slug] ?? null;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function normalizeHref(href: string): string {
  const h = href.trim();
  if (!h) return "#";
  if (h.startsWith("/")) return h;
  try {
    const u = new URL(h);
    if (u.hostname === "shalean.co.za" || u.hostname === "www.shalean.co.za") {
      return `${u.pathname}${u.search}${u.hash}` || "/";
    }
    if (u.protocol === "http:" || u.protocol === "https:") return h;
  } catch {
    return "#";
  }
  return h;
}

/** Inline **bold** / *em* + [label](href) — output safe HTML fragments. */
export function inlineMarkdownToHtml(text: string): string {
  const segments: Array<{ kind: "text"; v: string } | { kind: "link"; label: string; href: string }> = [];
  let remaining = text;
  while (remaining.length) {
    const m = remaining.match(/^([\s\S]*?)\[([^\]]+)\]\(([^)]+)\)/);
    if (!m) {
      segments.push({ kind: "text", v: remaining });
      break;
    }
    if (m[1]) segments.push({ kind: "text", v: m[1] });
    segments.push({ kind: "link", label: m[2]!, href: m[3]! });
    remaining = remaining.slice(m[0].length);
  }

  function textWithBoldEm(s: string): string {
    const parts = s.split(/\*\*/);
    return parts
      .map((chunk, i) => {
        if (i % 2 === 1) return `<strong>${escapeHtml(chunk)}</strong>`;
        return chunk.replace(/\*([^*]+)\*/g, (_, em) => `<em>${escapeHtml(String(em))}</em>`).split(/(<[^>]+>)/g).map((bit) => {
          if (bit.startsWith("<")) return bit;
          return escapeHtml(bit);
        }).join("");
      })
      .join("");
  }

  return segments
    .map((seg) => {
      if (seg.kind === "link") {
        const href = normalizeHref(seg.href);
        return `<a href="${escapeHtml(href)}">${textWithBoldEm(seg.label)}</a>`;
      }
      return textWithBoldEm(seg.v);
    })
    .join("");
}

function isSeparatorRow(line: string): boolean {
  const t = line.trim();
  if (!t.includes("|")) return false;
  return /^[\s|:\-]+$/.test(t);
}

function splitTableRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());
}

function tryParseMarkdownTable(lines: string[], startIdx: number): { columns: string[]; rows: string[][]; endIdx: number } | null {
  if (startIdx + 1 >= lines.length) return null;
  const headerLine = lines[startIdx]?.trim() ?? "";
  const sepLine = lines[startIdx + 1]?.trim() ?? "";
  if (!headerLine.includes("|") || !sepLine.includes("|")) return null;
  if (!isSeparatorRow(sepLine)) return null;
  const columns = splitTableRow(headerLine);
  if (columns.length < 2) return null;
  const rows: string[][] = [];
  let i = startIdx + 2;
  while (i < lines.length) {
    const L = lines[i]?.trim() ?? "";
    if (L === "" || !L.includes("|")) break;
    if (isSeparatorRow(L)) {
      i++;
      continue;
    }
    const cells = splitTableRow(lines[i] ?? "");
    if (cells.length === 1 && cells[0] === "") break;
    while (cells.length < columns.length) cells.push("");
    if (cells.length > columns.length) cells.length = columns.length;
    rows.push(cells.map((c) => markdownToPlainForFaq(c)));
    i++;
  }
  if (rows.length === 0) return null;
  return { columns: columns.map((c) => markdownToPlainForFaq(c)), rows, endIdx: i };
}

export function markdownToPlainForFaq(md: string): string {
  let s = md.replace(/\*\*([^*]+)\*\*/g, "$1").replace(/\*([^*]+)\*/g, "$1");
  s = s.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

function parseFaqFromMarkdown(faqMd: string): BlogFaqItem[] {
  const trimmed = faqMd.trim().replace(/\n---\s*$/m, "").trim();
  if (!trimmed) return [];
  const parts = trimmed.split(/\n(?=###\s)/);
  const chunks = parts.map((p) => p.replace(/^###\s+/, "").trim()).filter(Boolean);
  const items: BlogFaqItem[] = [];
  for (const chunk of chunks) {
    const nl = chunk.indexOf("\n");
    const question = (nl === -1 ? chunk : chunk.slice(0, nl)).trim();
    let answer = (nl === -1 ? "" : chunk.slice(nl + 1)).trim();
    answer = answer.replace(/\n---\s*$/m, "").trim();
    if (question && answer) {
      items.push({ question, answer: markdownToPlainForFaq(answer) });
    }
  }
  return items;
}

function faqItemsFromSchema(faqSchema: unknown): BlogFaqItem[] {
  const root = faqSchema as { mainEntity?: unknown[] } | null;
  const list = root?.mainEntity;
  if (!Array.isArray(list)) return [];
  const out: BlogFaqItem[] = [];
  for (const ent of list) {
    const e = ent as { name?: string; acceptedAnswer?: { text?: string } };
    const q = (e.name ?? "").trim();
    const a = (e.acceptedAnswer?.text ?? "").trim();
    if (q && a) out.push({ question: q, answer: markdownToPlainForFaq(a) });
  }
  return out;
}

function stripLeadingH1(md: string): string {
  const lines = md.split("\n");
  if (lines[0]?.startsWith("# ")) return lines.slice(1).join("\n").replace(/^\n+/, "");
  return md;
}

function stripRelatedGuides(md: string): string {
  return md.replace(RELATED_GUIDES_RE, "").trimEnd();
}

function splitMainFaqAndEndCta(markdown: string): {
  mainMd: string;
  faqMd: string;
  endCtaMd: string;
} {
  const faqMatch = FAQ_HEADING_RE.exec(markdown);
  if (!faqMatch || faqMatch.index == null) {
    return { mainMd: markdown, faqMd: "", endCtaMd: "" };
  }
  const beforeFaq = markdown.slice(0, faqMatch.index).trimEnd();
  const afterFaqHeading = markdown.slice(faqMatch.index + faqMatch[0].length);
  const endMatch = END_CTA_HEADING_RE.exec(afterFaqHeading);
  if (!endMatch || endMatch.index == null) {
    return { mainMd: beforeFaq, faqMd: afterFaqHeading.trim(), endCtaMd: "" };
  }
  const faqMd = afterFaqHeading.slice(0, endMatch.index).trim();
  const endCtaMd = afterFaqHeading.slice(endMatch.index + endMatch[0].length).trim();
  return { mainMd: beforeFaq, faqMd, endCtaMd };
}

type Segment = { kind: "text"; lines: string[] } | { kind: "table"; columns: string[]; rows: string[][] };

function segmentMarkdownBody(lines: string[]): Segment[] {
  const segments: Segment[] = [];
  let textBuf: string[] = [];
  let i = 0;
  const flushText = () => {
    if (textBuf.length) {
      segments.push({ kind: "text", lines: [...textBuf] });
      textBuf = [];
    }
  };
  while (i < lines.length) {
    const table = tryParseMarkdownTable(lines, i);
    if (table) {
      flushText();
      segments.push({ kind: "table", columns: table.columns, rows: table.rows });
      i = table.endIdx;
      continue;
    }
    textBuf.push(lines[i] ?? "");
    i++;
  }
  flushText();
  return segments;
}

function convertTextLinesToRichHtml(lines: string[]): string {
  const parts: string[] = [];
  let i = 0;
  const n = lines.length;

  const flushParagraph = (buf: string[]) => {
    const raw = buf.join("\n").trim();
    if (!raw) return;
    parts.push(`<p>${inlineMarkdownToHtml(raw)}</p>`);
  };

  while (i < n) {
    const line = lines[i] ?? "";
    const t = line.trim();
    if (t === "") {
      i++;
      continue;
    }
    if (t === "---") {
      parts.push("<hr/>");
      i++;
      continue;
    }
    if (t.startsWith("## ") && !t.startsWith("### ")) {
      parts.push(`<h2>${inlineMarkdownToHtml(t.slice(3).trim())}</h2>`);
      i++;
      continue;
    }
    if (t.startsWith("### ")) {
      parts.push(`<h3>${inlineMarkdownToHtml(t.slice(4).trim())}</h3>`);
      i++;
      continue;
    }
    if (/^\d+\.\s/.test(t)) {
      const items: string[] = [];
      while (i < n) {
        const L = (lines[i] ?? "").trim();
        if (!/^\d+\.\s/.test(L)) break;
        items.push(inlineMarkdownToHtml(L.replace(/^\d+\.\s+/, "")));
        i++;
      }
      parts.push(`<ol>${items.map((it) => `<li>${it}</li>`).join("")}</ol>`);
      continue;
    }
    if (t.startsWith("- ")) {
      const items: string[] = [];
      while (i < n) {
        const L = (lines[i] ?? "").trim();
        if (!L.startsWith("- ")) break;
        items.push(inlineMarkdownToHtml(L.slice(2).trim()));
        i++;
      }
      parts.push(`<ul>${items.map((it) => `<li>${it}</li>`).join("")}</ul>`);
      continue;
    }
    const para: string[] = [line];
    i++;
    while (i < n) {
      const L = lines[i] ?? "";
      const tr = L.trim();
      if (tr === "") break;
      if (tr === "---" || tr.startsWith("## ") || tr.startsWith("### ") || tr.startsWith("- ") || /^\d+\.\s/.test(tr))
        break;
      if (tryParseMarkdownTable(lines, i)) break;
      para.push(L);
      i++;
    }
    flushParagraph(para);
  }
  return parts.join("\n");
}

function parseEndCtaBlock(endCtaMd: string): BlogContentBlock | null {
  const raw = endCtaMd.trim();
  if (!raw) return null;
  const linkMatch = raw.match(/\[([^\]]+)\]\(([^)]+)\)/);
  const button_text = linkMatch?.[1]?.trim() || "Book cleaning";
  const link = linkMatch?.[2] ? normalizeHref(linkMatch[2]) : "/book";
  const plain = markdownToPlainForFaq(raw).slice(0, 600);
  return {
    type: "cta",
    title: "Book with Shalean",
    description: plain || undefined,
    button_text,
    link,
    variant: "primary",
  };
}

export type GovernedSeedInternalLink = { url: string; anchor_text: string };

export function buildGovernedSeedContentJson(params: {
  content_markdown: string;
  faq_schema_json?: unknown;
  internal_links?: GovernedSeedInternalLink[] | null;
}): { ok: true; content: BlogContentJson } | { ok: false; error: string } {
  let md = params.content_markdown.replace(/\r\n/g, "\n");
  md = stripRelatedGuides(md);
  md = stripLeadingH1(md);
  const { mainMd, faqMd, endCtaMd } = splitMainFaqAndEndCta(md);

  let faqItems = parseFaqFromMarkdown(faqMd);
  if (faqItems.length === 0) {
    faqItems = faqItemsFromSchema(params.faq_schema_json);
  }
  if (faqItems.length === 0) {
    return { ok: false, error: "No FAQ items parsed from markdown or faq_schema_json." };
  }

  const mainLines = mainMd.split("\n");
  const segments = segmentMarkdownBody(mainLines);
  const blocks: BlogContentBlock[] = [];

  for (const seg of segments) {
    if (seg.kind === "table") {
      blocks.push({
        type: "comparison_table",
        columns: seg.columns,
        rows: seg.rows,
      });
    } else {
      const html = convertTextLinesToRichHtml(seg.lines);
      const safe = sanitizeBlogRichHtml(html);
      if (safe.trim()) {
        blocks.push({ type: "rich_text", html: safe });
      }
    }
  }

  blocks.push({ type: "faq", items: faqItems });

  const endCta = parseEndCtaBlock(endCtaMd);
  if (endCta) blocks.push(endCta);

  const links = params.internal_links?.filter((l) => l.url?.trim() && l.anchor_text?.trim()) ?? [];
  if (links.length) {
    blocks.push({
      type: "internal_links",
      title: "Helpful links",
      links: links.map((l) => ({
        label: l.anchor_text.trim(),
        url: normalizeHref(l.url),
      })),
    });
  }

  const content: BlogContentJson = { schema_version: BLOG_CONTENT_JSON_SCHEMA_VERSION, blocks };
  return { ok: true, content };
}
