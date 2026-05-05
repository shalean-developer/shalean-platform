import type { BlogContentBlock, BlogContentJson } from "@/lib/blog/content-json";

function normalizeAssetPath(url: string | null | undefined): string {
  const u = String(url ?? "").trim();
  if (!u) return "";
  if (u.startsWith("http://") || u.startsWith("https://")) {
    try {
      return new URL(u).pathname;
    } catch {
      return u;
    }
  }
  return u.startsWith("/") ? u : `/${u}`;
}

/** Removes the first in-body image that duplicates the featured hero to avoid back-to-back repeats. */
export function stripFirstDuplicateFeaturedImage(content: BlogContentJson, featuredSrc: string | null): BlogContentJson {
  if (!featuredSrc?.trim()) return content;
  const target = normalizeAssetPath(featuredSrc);
  if (!target) return content;

  let removed = false;
  const blocks: BlogContentBlock[] = [];
  const rawBlocks = Array.isArray(content.blocks) ? content.blocks : [];
  for (const b of rawBlocks) {
    if (!removed && b.type === "image" && normalizeAssetPath(b.url) === target) {
      removed = true;
      continue;
    }
    blocks.push(b);
  }

  return { ...content, blocks };
}
