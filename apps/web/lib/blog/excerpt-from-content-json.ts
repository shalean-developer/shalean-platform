import type { BlogContentJson, BlogIntroBlock } from "./content-json";

export function excerptFromFirstIntroBlock(
  content: BlogContentJson,
  maxLen = 160
): string {
  const intro = content.blocks.find((b): b is BlogIntroBlock => b.type === "intro");
  if (!intro?.content) return "";
  const t = intro.content.replace(/\s+/g, " ").trim();
  if (t.length <= maxLen) return t;
  const cut = t.slice(0, maxLen - 1).trimEnd();
  return `${cut}…`;
}
