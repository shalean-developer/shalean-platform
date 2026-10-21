import type { BlogContentJson } from "./content-json";
import { DEFAULT_BLOG_FEATURED_IMAGE, isTrustedBlogFeaturedSrc } from "@/lib/blogImageMap";

export function isAllowedAuthoringBlogImageSrc(src: string): boolean {
  return src.trim() === DEFAULT_BLOG_FEATURED_IMAGE || isTrustedBlogFeaturedSrc(src);
}

/** Same URL policy as the public renderer; never silently replace an authored image. */
export function findUnsupportedBlogImages(content: BlogContentJson): string[] {
  const urls: string[] = [];
  for (const block of content.blocks) {
    if (block.type === "image" && block.url.trim()) urls.push(block.url);
    if (block.type === "rich_text") {
      for (const match of block.html.matchAll(/<img\b[^>]*?\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/gi)) urls.push(match[1] ?? match[2] ?? match[3]);
    }
  }
  return urls.filter((url) => !isAllowedAuthoringBlogImageSrc(url));
}
