"use client";

import { BlogArticleFrame } from "@/components/blog/BlogArticleFrame";
import { BlogDbArticleBody } from "@/components/blog/BlogDbArticleBody";
import type { BlogContentJson } from "@/lib/blog/content-json";
import { prepareBlogArticleContent } from "@/lib/blog/prepare-blog-article-content";

export function BlogArticlePreview({ title, excerpt, slug, featuredUrl, featuredAlt, content, wordCount }: {
  title: string; excerpt: string; slug: string; featuredUrl: string; featuredAlt: string; content: BlogContentJson; wordCount: number;
}) {
  const prepared = prepareBlogArticleContent(content, slug, featuredUrl);
  return <section aria-label="Article preview" className="bg-white px-4 py-8 sm:px-8">
    <p className="mx-auto mb-8 max-w-[720px] border-b pb-4 text-sm text-zinc-500">Preview of your current edits. Nothing is saved or published by switching views.</p>
    <BlogArticleFrame title={title || "Untitled article"} excerpt={excerpt} hero={featuredUrl ? { src: featuredUrl, alt: featuredAlt || title } : null} readingTimeMinutes={wordCount > 0 ? Math.ceil(wordCount / 220) : null} preview trackingSlug={slug}>
      {prepared.blocks.length ? <BlogDbArticleBody content={prepared} autoLinkSlug={slug} /> : <p className="text-zinc-500">Your article will appear here as you write.</p>}
    </BlogArticleFrame>
  </section>;
}
