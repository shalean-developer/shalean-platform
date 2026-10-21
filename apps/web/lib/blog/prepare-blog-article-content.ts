import type { BlogContentJson } from "./content-json";
import { injectLocationHubSeoImages } from "./injectLocationHubSeoImages";
import { stripFirstDuplicateFeaturedImage } from "./stripDuplicateFeaturedImage";

/** Pure display preparation: never rewrites the editor's stored content tree. */
export function prepareBlogArticleContent(content: BlogContentJson, slug: string, featuredSrc: string | null): BlogContentJson {
  return stripFirstDuplicateFeaturedImage({ ...content, blocks: injectLocationHubSeoImages(slug, content.blocks) }, featuredSrc);
}
