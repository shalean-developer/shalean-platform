import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { BlogArticleEndCta } from "@/components/blog/BlogArticleConversionBlocks";
import { linkInNavClassName } from "@/lib/ui/linkClassNames";
import { cn } from "@/lib/utils";

function isRemoteSrc(src: string) {
  return src.startsWith("http://") || src.startsWith("https://");
}

export type BlogPostLayoutProps = {
  breadcrumbCurrentLabel: string;
  h1: string;
  lede?: string;
  publishedAtIso: string;
  /** When set and later than `publishedAtIso`, shows an “Updated on” line */
  updatedAtIso?: string;
  readingTimeMinutes: number | null;
  hero: { src: string; alt: string } | null;
  children: ReactNode;
  trackingSlug: string;
  /** Rendered only when non-empty and you want links outside structured blocks */
  supplementalInternalLinks?: { label: string; href: string }[];
  relatedLinksSlot?: ReactNode;
};

export function BlogPostLayout({
  breadcrumbCurrentLabel,
  h1,
  lede,
  publishedAtIso,
  updatedAtIso,
  readingTimeMinutes,
  hero,
  children,
  trackingSlug,
  supplementalInternalLinks,
  relatedLinksSlot,
}: BlogPostLayoutProps) {
  const readLabel =
    readingTimeMinutes != null && readingTimeMinutes > 0
      ? `${readingTimeMinutes} min read`
      : null;

  const publishedLabel = new Intl.DateTimeFormat("en-ZA", {
    dateStyle: "long",
    timeZone: "Africa/Johannesburg",
  }).format(new Date(publishedAtIso));

  const publishedMs = new Date(publishedAtIso).getTime();
  const updatedMs = updatedAtIso ? new Date(updatedAtIso).getTime() : NaN;
  const showUpdated =
    updatedAtIso != null &&
    updatedAtIso !== "" &&
    !Number.isNaN(updatedMs) &&
    updatedMs > publishedMs;

  const updatedLabel =
    showUpdated && updatedAtIso
      ? new Intl.DateTimeFormat("en-ZA", {
          dateStyle: "long",
          timeZone: "Africa/Johannesburg",
        }).format(new Date(updatedAtIso))
      : null;

  const heroRemote = hero ? isRemoteSrc(hero.src) : false;

  return (
    <article className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:max-w-4xl lg:px-8 lg:py-16">
      <nav className="text-sm text-zinc-500" aria-label="Breadcrumb">
        <Link href="/" className={cn(linkInNavClassName, "text-sm")}>
          Home
        </Link>
        <span className="mx-2 text-zinc-400" aria-hidden>
          /
        </span>
        <Link href="/blog" className={cn(linkInNavClassName, "text-sm")}>
          Blog
        </Link>
        <span className="mx-2 text-zinc-400" aria-hidden>
          /
        </span>
        <span className="text-zinc-700">{breadcrumbCurrentLabel}</span>
      </nav>

      <header className="mt-6 border-b border-zinc-200 pb-10">
        <p className="text-xs font-semibold uppercase tracking-wide text-blue-600">Shalean · Cape Town</p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight text-zinc-900 sm:text-4xl lg:text-[2.35rem] lg:leading-tight">
          {h1}
        </h1>
        {lede ? <p className="mt-4 text-lg leading-relaxed text-zinc-600">{lede}</p> : null}
        <p className="mt-4 text-sm text-zinc-500">
          Published {publishedLabel}
          {readLabel ? (
            <>
              {" "}
              · {readLabel}
            </>
          ) : null}
          {showUpdated && updatedLabel ? (
            <>
              <br />
              <span className="text-zinc-600">Updated on {updatedLabel}</span>
            </>
          ) : null}
        </p>
      </header>

      {hero ? (
        <div className="relative mt-8 aspect-[16/9] w-full overflow-hidden rounded-2xl bg-zinc-100 shadow-md ring-1 ring-zinc-200/60">
          <Image
            src={hero.src}
            alt={hero.alt}
            fill
            className="object-cover"
            sizes="(max-width: 896px) 100vw, 896px"
            priority
            fetchPriority="high"
            unoptimized={heroRemote}
          />
        </div>
      ) : null}

      <div className="py-10">{children}</div>

      {supplementalInternalLinks && supplementalInternalLinks.length > 0 ? (
        <nav className="not-prose border-t border-zinc-200 pt-10" aria-label="Related guides">
          <h2 className="text-lg font-semibold text-zinc-900">Related on this site</h2>
          <ul className="mt-4 space-y-2">
            {supplementalInternalLinks.map((l) => (
              <li key={l.href + l.label}>
                <Link
                  href={l.href}
                  className="text-base font-medium text-blue-600 underline-offset-4 hover:text-blue-700 hover:underline"
                >
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}

      {relatedLinksSlot ? <div className="not-prose mt-12">{relatedLinksSlot}</div> : null}

      <BlogArticleEndCta trackingSlug={trackingSlug} />

      <footer className="not-prose mt-16 border-t border-zinc-200 pt-10 text-center">
        <p className="text-sm text-zinc-500">
          <Link href="/blog" className={cn(linkInNavClassName, "text-sm")}>
            ← Back to all articles
          </Link>
        </p>
      </footer>
    </article>
  );
}
