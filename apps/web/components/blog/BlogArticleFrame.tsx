import type { ReactNode } from "react";
import { BlogHero } from "./engine/BlogHero";
import { BlogContent } from "./engine/BlogContent";
import { BlogArticleEndCta } from "./BlogArticleConversionBlocks";

/** The article surface shared by the public route and the unsaved editor preview. */
export function BlogArticleFrame({ title, excerpt, hero, readingTimeMinutes, publishedAt, updatedAt, preview = false, children, outline, afterArticle, trackingSlug }: {
  title: string;
  excerpt?: string;
  hero: { src: string; alt: string } | null;
  readingTimeMinutes?: number | null;
  publishedAt?: string;
  updatedAt?: string;
  preview?: boolean;
  children: ReactNode;
  outline?: ReactNode;
  afterArticle?: ReactNode;
  trackingSlug: string;
}) {
  return <article data-blog-article-root className="mx-auto w-full max-w-[720px] space-y-8 text-zinc-900">
    <header className="space-y-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-blue-700">Shalean · Cleaning guides</p>
      <h1 className="text-3xl font-bold leading-tight tracking-tight sm:text-4xl">{title}</h1>
      {excerpt ? <p className="text-lg leading-relaxed text-zinc-600 sm:text-xl">{excerpt}</p> : null}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-zinc-500">
        {preview ? <span>Preview · Current unpublished changes</span> : publishedAt ? <span>Published {publishedAt}</span> : null}
        {!preview && updatedAt ? <span>Updated {updatedAt}</span> : null}
        {readingTimeMinutes != null && readingTimeMinutes > 0 ? <span>{readingTimeMinutes} min read</span> : null}
      </div>
    </header>
    {hero ? <BlogHero key={hero.src} src={hero.src} alt={hero.alt} overlay={false} /> : null}
    {outline}
    <BlogContent prose>{children}</BlogContent>
    <BlogArticleEndCta trackingSlug={trackingSlug} />
    {afterArticle}
  </article>;
}
