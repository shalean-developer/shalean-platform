import { GrowthCtaLink } from "@/components/growth/GrowthCtaLink";
import type { BlogPostMeta } from "@/lib/blog/posts";

const proseArticle =
  "prose prose-zinc max-w-3xl prose-headings:scroll-mt-24 prose-a:text-blue-600 prose-a:no-underline hover:prose-a:underline";

const midCtaWrap = "not-prose my-10 rounded-2xl border border-blue-100 bg-blue-50/60 px-6 py-8 text-center";

export function BlogPostGlobalSections({ post }: { post: BlogPostMeta }) {
  const sourceMid = `blog_${post.slug}_mid_global`;

  return (
    <>
      <div className={proseArticle}>
        <h2>Quick Summary</h2>
        <ul>
          {post.quickSummary.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>

        <h2>When should you use this in Cape Town?</h2>
        {post.whenToUseParagraphs.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>

      <div className={midCtaWrap}>
        <p className="text-sm font-medium text-zinc-800">
          Check pricing and availability instantly for your home in Cape Town
        </p>
        <GrowthCtaLink
          href="/booking?step=entry"
          source={sourceMid}
          className="mt-4 inline-flex min-h-12 items-center justify-center rounded-xl bg-blue-600 px-8 text-base font-semibold text-white shadow-sm transition hover:bg-blue-700"
        >
          Book your cleaning online
        </GrowthCtaLink>
        <p className="mt-3 text-xs text-zinc-600">
          <GrowthCtaLink
            href="/booking?step=entry"
            source={`${sourceMid}_text`}
            className="font-medium text-blue-600 underline decoration-blue-600/30 underline-offset-2 hover:text-blue-700"
          >
            Check pricing and availability instantly
          </GrowthCtaLink>
        </p>
      </div>
    </>
  );
}
