import { revalidatePath, revalidateTag } from "next/cache";

export function revalidateBlog(slug: string, previousSlug?: string) {
  revalidateTag("blog-public", { expire: 0 });
  revalidatePath("/blog");
  for (const s of new Set([slug, previousSlug].filter(Boolean))) revalidatePath(`/blog/${s}`);
  revalidatePath("/blog/category/[slug]", "page");
  revalidatePath("/blog/tag/[slug]", "page");
  revalidatePath("/sitemap.xml");
}
