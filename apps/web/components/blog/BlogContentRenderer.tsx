"use client";

import Image from "next/image";
import { SafeInternalLink } from "@/components/links/SafeInternalLink";
import { blogFaqHeadingDomId, defaultBlogBlockAnchorId } from "@/lib/blog/blog-block-anchors";
import { coerceBlogImageSrcForNext } from "@/lib/blogImageMap";
import type { BlogContentBlock, BlogContentJson } from "@/lib/blog/content-json";
import { injectMarkdownAutoLinks } from "@/lib/blog/seo/auto-link-keywords";
import { injectRichTextHeadingAnchors } from "@/lib/blog/inject-rich-text-heading-anchors";
import { sanitizeBlogRichHtml } from "@/lib/blog/sanitize-blog-html";
import { sanitizeEditorialHtml, sanitizeEditorialMarkdown } from "@/lib/blog/editorialSanitize";
import { cn } from "@/lib/utils";
import "./blog-rich-text.css";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

type Props = {
  content: BlogContentJson;
  /** Trusted CMS articles only — first-hit keyword → internal URL in paragraph blocks. */
  autoLinkSlug?: string;
  /** Offset for default anchor ids when this renderer is the tail half of a split article. */
  blockIndexOffset?: number;
};

/** CMS / schema drift: never pass non-primitives as React text children. */
function safeBlockText(value: unknown): string {
  if (typeof value === "string") return value;
  if (value == null) return "";
  return String(value);
}

function SectionHeading({
  level,
  className,
  children,
}: {
  level: 2 | 3 | 4;
  className?: string;
  children: React.ReactNode;
}) {
  if (level === 3) {
    return <h3 className={className}>{children}</h3>;
  }
  if (level === 4) {
    return <h4 className={className}>{children}</h4>;
  }
  return <h2 className={className}>{children}</h2>;
}

function isRemoteSrc(src: string) {
  return src.startsWith("http://") || src.startsWith("https://");
}

/** Renders `paragraph.content` with optional `[label](/path)` → internal links (trusted CMS content only). */
function ParagraphWithOptionalInlineLinks({
  id,
  className,
  text,
  autoLinkSlug,
}: {
  id?: string;
  className?: string;
  text: string;
  autoLinkSlug?: string;
}) {
  const linkClass =
    "font-medium text-blue-600 underline-offset-4 hover:text-blue-700 hover:underline";
  const parts: React.ReactNode[] = [];
  const body = autoLinkSlug
    ? injectMarkdownAutoLinks(sanitizeEditorialMarkdown(text))
    : sanitizeEditorialMarkdown(text);
  const re = /\[([^\]]+)\]\(([^)]+)\)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(body)) !== null) {
    if (m.index > last) {
      parts.push(body.slice(last, m.index));
    }
    parts.push(
      <SafeInternalLink key={`${k++}-${m.index}`} href={m[2]} className={linkClass} linkContext="blog paragraph markdown">
        {m[1]}
      </SafeInternalLink>,
    );
    last = m.index + m[0].length;
  }
  if (last < body.length) {
    parts.push(body.slice(last));
  }
  return (
    <p id={id} className={className}>
      {parts.length ? parts : body}
    </p>
  );
}

function ArticleHeading({
  id,
  level,
  compactTop,
  children,
}: {
  id?: string;
  level: 1 | 2 | 3;
  /** First block is a heading — avoid oversized top margin above the fold. */
  compactTop?: boolean;
  children: React.ReactNode;
}) {
  const chapter =
    level === 3
      ? "mt-10 border-b border-zinc-200/60 pb-2.5 mb-2 sm:mt-11"
      : "mt-12 border-b border-zinc-200/70 pb-3 mb-3 sm:mt-14";
  const top = compactTop ? "mt-2 sm:mt-4" : chapter;
  const base = cn(
    "not-prose scroll-mt-28 font-bold tracking-tight text-zinc-900 max-w-none",
    top,
  );
  /** Page layout owns the sole document `<h1>`; CMS level-1 headings render as `<h2>` visually. */
  if (level === 1) {
    return (
      <h2 id={id} className={cn(base, "text-3xl sm:text-4xl")}>
        {children}
      </h2>
    );
  }
  if (level === 2) {
    return (
      <h2 id={id} className={cn(base, "text-2xl sm:text-3xl")}>
        {children}
      </h2>
    );
  }
  return (
    <h3 id={id} className={cn(base, "text-xl sm:text-2xl")}>
      {children}
    </h3>
  );
}

function Block({
  block,
  index,
  blockIndexOffset,
  autoLinkSlug,
}: {
  block: BlogContentBlock;
  index: number;
  /** Global index in merged `content_json` order — keeps anchors stable when body is split around mid-slot. */
  blockIndexOffset: number;
  autoLinkSlug?: string;
}) {
  const gi = index + blockIndexOffset;
  switch (block.type) {
    case "intro":
      return (
        <p
          id={block.id}
          className="max-w-prose text-base leading-relaxed text-zinc-700 sm:text-[1.0625rem] sm:leading-[1.65]"
        >
          {safeBlockText(block.content)}
        </p>
      );

    case "quick_answer":
      return (
        <aside
          id={block.id}
          className="not-prose rounded-xl border border-blue-100 bg-blue-50/80 px-4 py-4 text-zinc-800 shadow-sm sm:px-6 sm:py-5"
          aria-label="Quick answer"
        >
          <p className="whitespace-pre-line text-base leading-relaxed font-medium text-zinc-900">
            {safeBlockText(block.content)}
          </p>
        </aside>
      );

    case "section": {
      const raw = block.heading_level ?? 2;
      const level: 2 | 3 | 4 = raw === 3 || raw === 4 ? raw : 2;
      return (
        <section
          id={block.id ?? defaultBlogBlockAnchorId(block, gi)}
          className={cn(
            "scroll-mt-28 space-y-4",
            gi === 0 ? "pt-1" : "mt-6 border-t border-zinc-100 pt-8 sm:mt-8 sm:pt-9",
          )}
        >
          <SectionHeading
            level={level}
            className="not-prose text-xl font-semibold tracking-tight text-zinc-900 sm:text-2xl"
          >
            {safeBlockText(block.title)}
          </SectionHeading>
          <p className="max-w-prose text-base leading-relaxed text-zinc-600 whitespace-pre-line">
            {safeBlockText(block.content)}
          </p>
        </section>
      );
    }

    case "comparison": {
      const cmpItems = Array.isArray(block.items) ? block.items : [];
      return (
        <div
          id={block.id}
          className="not-prose divide-y divide-zinc-200 overflow-hidden rounded-xl border border-zinc-200 bg-zinc-50/60"
          role="list"
          aria-label="Comparison"
        >
          {cmpItems.map((item, ii) => (
            <div key={`${safeBlockText(item.label)}-${ii}`} role="listitem" className="px-4 py-3.5 sm:px-5 sm:py-4">
              <p className="text-sm font-semibold text-zinc-900">{safeBlockText(item.label)}</p>
              <p className="mt-1.5 text-sm leading-relaxed text-zinc-600">{safeBlockText(item.value)}</p>
            </div>
          ))}
        </div>
      );
    }

    case "comparison_table": {
      const cols = Array.isArray(block.columns) ? block.columns : [];
      const rows = Array.isArray(block.rows) ? block.rows : [];
      return (
        <div id={block.id} className="not-prose space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 sm:text-sm sm:normal-case sm:font-normal sm:text-zinc-600">
            Comparison — swipe on mobile if columns extend past the screen.
          </p>
          <div className="-mx-4 min-w-0 max-w-full touch-pan-x overflow-x-auto overscroll-x-contain px-4 sm:mx-0 sm:px-0">
            <div className="rounded-2xl border border-zinc-200/90 bg-white shadow-sm ring-1 ring-zinc-950/[0.03] sm:rounded-xl">
              <table className="w-full min-w-[280px] border-collapse text-left text-sm text-zinc-700">
                <thead>
                  <tr className="border-b border-zinc-200 bg-zinc-50/95">
                    {cols.map((col, i) => (
                      <th
                        key={i}
                        scope="col"
                        className="px-3 py-3.5 text-sm font-semibold text-zinc-900 first:rounded-tl-xl last:rounded-tr-xl sm:px-4"
                      >
                        {col || "—"}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, ri) => (
                    <tr
                      key={ri}
                      className={cn(
                        "border-b border-zinc-100 last:border-0",
                        ri % 2 === 1 ? "bg-zinc-50/40" : "bg-white",
                      )}
                    >
                      {(Array.isArray(row) ? row : []).map((cell, ci) => (
                        <td key={ci} className="px-3 py-3.5 align-top text-sm leading-relaxed sm:px-4">
                          {safeBlockText(cell)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      );
    }

    case "bullets": {
      const bulletItems = Array.isArray(block.items) ? block.items : [];
      return (
        <section id={block.id} className="space-y-3" aria-label={safeBlockText(block.title) || "Bullet list"}>
          {block.title ? (
            <h3 className="text-lg font-semibold text-zinc-900">{safeBlockText(block.title)}</h3>
          ) : null}
          <ul className="list-disc space-y-2.5 pl-5 text-base leading-relaxed text-zinc-600 marker:text-blue-600">
            {bulletItems.map((item, i) => (
              <li key={i}>{safeBlockText(item)}</li>
            ))}
          </ul>
        </section>
      );
    }

    case "cta":
      return (
        <aside
          id={block.id}
          className={cn(
            "not-prose rounded-2xl border p-6 shadow-sm sm:p-8",
            block.variant === "secondary"
              ? "border-zinc-200 bg-zinc-50"
              : "border-blue-100 bg-gradient-to-br from-blue-50 to-white",
          )}
          aria-label="Call to action"
        >
          <h3 className="text-xl font-semibold tracking-tight text-zinc-900">{safeBlockText(block.title)}</h3>
          {block.description ? (
            <p className="mt-2 text-sm leading-relaxed text-zinc-600">{safeBlockText(block.description)}</p>
          ) : null}
          <div className="mt-5">
            <Button asChild size="lg" variant={block.variant === "secondary" ? "secondary" : "default"}>
              <SafeInternalLink href={block.link} linkContext="blog cta block">
                {safeBlockText(block.button_text)}
              </SafeInternalLink>
            </Button>
          </div>
        </aside>
      );

    case "faq": {
      const faqItems = Array.isArray(block.items) ? block.items : [];
      const headingId = blogFaqHeadingDomId(block, gi);
      const accordion = (
        <Accordion type="single" collapsible className="mt-2 w-full sm:mt-3">
          {faqItems.map((item, i) => (
            <AccordionItem
              value={`faq-${gi}-${i}`}
              key={i}
              className="border-b border-zinc-200/80 last:border-b-0"
            >
              <AccordionTrigger className="py-4 text-left text-base font-semibold text-zinc-900 hover:text-blue-800 hover:no-underline [&[data-state=open]>svg]:text-blue-700">
                {safeBlockText(item.question)}
              </AccordionTrigger>
              <AccordionContent className="text-base leading-relaxed text-zinc-600">
                {safeBlockText(item.answer)}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      );
      const chapterShell =
        "not-prose scroll-mt-24 rounded-2xl border border-zinc-200/90 bg-zinc-50/50 px-4 py-8 shadow-sm sm:px-8 sm:py-10";
      if (block.omit_section_heading) {
        return (
          <section id={block.id ?? `blog-faq-${gi}`} className={chapterShell} aria-labelledby={headingId}>
            <h2 id={headingId} className="text-xl font-bold tracking-tight text-zinc-900 sm:text-2xl">
              FAQ
            </h2>
            <p className="mt-2 max-w-prose text-sm leading-relaxed text-zinc-600">
              Short answers to common questions about this topic—tap a row to expand.
            </p>
            {accordion}
          </section>
        );
      }
      return (
        <section
          id={block.id ?? `blog-faq-${gi}`}
          className={chapterShell}
          aria-labelledby={headingId}
        >
          <h2 id={headingId} className="text-xl font-bold tracking-tight text-zinc-900 sm:text-2xl">
            Frequently asked questions
          </h2>
          <p className="mt-2 max-w-prose text-sm leading-relaxed text-zinc-600">
            Practical follow-ups readers ask before booking—expand any item for detail.
          </p>
          {accordion}
        </section>
      );
    }

    case "rich_text": {
      const safe = sanitizeEditorialHtml(sanitizeBlogRichHtml(block.html));
      const scope = block.id?.trim() || defaultBlogBlockAnchorId(block, gi);
      const { html: richHtml } = injectRichTextHeadingAnchors(safe, scope);
      return (
        <div className="not-prose" data-block-type="rich_text-wrap">
          <div
            id={block.id}
            className={cn(
              "blog-rich-text prose prose-lg prose-zinc max-w-none text-zinc-700",
              "prose-headings:scroll-mt-28 prose-headings:font-bold prose-headings:text-zinc-900",
              "prose-h2:mt-10 prose-h2:mb-4 sm:prose-h2:text-3xl",
              "prose-h3:mt-8 prose-h3:mb-3 sm:prose-h3:text-2xl",
              "prose-h4:mt-6 prose-h4:mb-2 prose-h4:font-semibold prose-h4:text-zinc-800",
              "prose-a:font-medium prose-a:text-blue-600 prose-a:underline prose-a:underline-offset-4 prose-a:hover:text-blue-700",
              "prose-ul:marker:text-blue-600 prose-ol:marker:text-blue-600",
              "prose-img:rounded-lg prose-img:shadow-sm prose-img:my-8",
              "prose-blockquote:border-l-blue-500 prose-blockquote:bg-blue-50/50 prose-blockquote:py-1 prose-blockquote:px-4",
            )}
            data-block-type="rich_text"
            dangerouslySetInnerHTML={{ __html: richHtml }}
          />
        </div>
      );
    }

    case "paragraph":
      return (
        <ParagraphWithOptionalInlineLinks
          id={block.id}
          className="max-w-prose text-base leading-relaxed text-zinc-600 whitespace-pre-line"
          text={safeBlockText(block.content)}
          autoLinkSlug={autoLinkSlug}
        />
      );

    case "heading":
      return (
        <ArticleHeading
          id={block.id ?? defaultBlogBlockAnchorId(block, gi)}
          level={block.level}
          compactTop={gi === 0}
        >
          {safeBlockText(block.content)}
        </ArticleHeading>
      );

    case "bullet_list": {
      const blItems = Array.isArray(block.items) ? block.items : [];
      return (
        <section id={block.id} className="space-y-3" aria-label={safeBlockText(block.title) || "Bullet list"}>
          {block.title ? (
            <h3 className="text-lg font-semibold text-zinc-900">{safeBlockText(block.title)}</h3>
          ) : null}
          <ul className="list-disc space-y-2.5 pl-5 text-base leading-relaxed text-zinc-600 marker:text-blue-600">
            {blItems.map((item, i) => (
              <li key={i}>{safeBlockText(item)}</li>
            ))}
          </ul>
        </section>
      );
    }

    case "numbered_list": {
      const numItems = Array.isArray(block.items) ? block.items : [];
      return (
        <section id={block.id} className="space-y-3" aria-label={safeBlockText(block.title) || "Numbered list"}>
          {block.title ? (
            <h3 className="text-lg font-semibold text-zinc-900">{safeBlockText(block.title)}</h3>
          ) : null}
          <ol className="list-decimal space-y-2.5 pl-5 text-base leading-relaxed text-zinc-600 marker:text-blue-600">
            {numItems.map((item, i) => (
              <li key={i} className="pl-1">
                {safeBlockText(item)}
              </li>
            ))}
          </ol>
        </section>
      );
    }

    case "key_takeaways": {
      const ktItems = Array.isArray(block.items) ? block.items : [];
      return (
        <aside
          id={block.id}
          className="not-prose rounded-xl border border-amber-100 bg-amber-50/60 px-4 py-4 sm:px-6 sm:py-5"
          aria-label="Key takeaways"
        >
          <p className="text-sm font-semibold uppercase tracking-wide text-amber-900/90">Key takeaways</p>
          <ul className="mt-3 list-disc space-y-2.5 pl-5 text-base leading-relaxed text-zinc-800 marker:text-amber-700">
            {ktItems.map((item, i) => (
              <li key={i}>{safeBlockText(item)}</li>
            ))}
          </ul>
        </aside>
      );
    }

    case "image": {
      if (!block.url?.trim()) {
        return null;
      }
      const imageSrc = coerceBlogImageSrcForNext(autoLinkSlug ?? "blog", block.url.trim());
      const remote = isRemoteSrc(imageSrc);
      return (
        <figure id={block.id} className="not-prose my-2 w-full space-y-2">
          <div className="relative aspect-[16/9] w-full overflow-hidden rounded-2xl bg-zinc-100 ring-1 ring-zinc-200/60 shadow-sm">
            <Image
              src={imageSrc}
              alt={safeBlockText(block.alt)}
              fill
              className="object-cover"
              sizes="(max-width: 1024px) 100vw, 672px"
              loading={block.priority ? undefined : "lazy"}
              priority={block.priority}
              unoptimized={remote}
            />
          </div>
          {block.caption ? (
            <figcaption className="text-center text-sm text-zinc-500">{safeBlockText(block.caption)}</figcaption>
          ) : null}
        </figure>
      );
    }

    case "quote":
      return (
        <blockquote
          id={block.id}
          className="not-prose border-l-4 border-blue-500 bg-zinc-50 py-4 pl-5 pr-4 text-lg italic leading-relaxed text-zinc-800"
        >
          <p>{safeBlockText(block.content)}</p>
          {block.attribution ? (
            <footer className="mt-3 text-sm font-medium not-italic text-zinc-600">
              — {safeBlockText(block.attribution)}
            </footer>
          ) : null}
        </blockquote>
      );

    case "internal_links": {
      const links = Array.isArray(block.links) ? block.links : [];
      return (
        <nav id={block.id} className="not-prose space-y-3" aria-label={safeBlockText(block.title) || "Related links"}>
          {block.title ? (
            <h3 className="text-lg font-semibold text-zinc-900">{safeBlockText(block.title)}</h3>
          ) : null}
          <ul className="space-y-2">
            {links.map((l) => (
              <li key={String(l.url) + safeBlockText(l.label)}>
                <SafeInternalLink
                  href={String(l.url)}
                  className="text-base font-medium text-blue-600 underline-offset-4 hover:text-blue-700 hover:underline"
                  linkContext="blog internal_links block"
                >
                  {safeBlockText(l.label)}
                </SafeInternalLink>
              </li>
            ))}
          </ul>
        </nav>
      );
    }

    case "service_area":
      return (
        <section
          id={block.id}
          className="not-prose space-y-4 rounded-2xl border border-blue-100 bg-blue-50/35 px-5 py-5 sm:px-6"
          aria-label="Local service areas"
        >
          <div>
            <h3 className="text-lg font-semibold text-zinc-900">Local coverage near you</h3>
            <p className="mt-1 text-sm leading-relaxed text-zinc-600">
              Browse these suburbs for cleaners near me—each hub explains typical scopes before you continue to booking.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {(Array.isArray(block.locations) ? block.locations : []).map((loc) => (
              <span
                key={loc}
                className="inline-flex items-center rounded-full border border-white bg-white/90 px-3 py-1.5 text-sm font-medium text-zinc-800 shadow-sm"
              >
                {loc}
              </span>
            ))}
          </div>
        </section>
      );

    default: {
      /** Runtime/CMS drift: never render a raw block object (React throws “objects are not valid as a child”). */
      console.warn("[BlogContentRenderer] unknown block type skipped", {
        type: (block as { type?: unknown }).type,
      });
      return null;
    }
  }
}

export function BlogContentRenderer({ content, autoLinkSlug, blockIndexOffset = 0 }: Props) {
  if (content == null || typeof content !== "object") {
    console.error("[BlogContentRenderer] invalid content root — expected content_json object");
    return (
      <div
        className="blog-body mx-auto max-w-[65ch] rounded-lg border border-amber-200 bg-amber-50/80 px-4 py-6 text-sm text-amber-950"
        data-blog-content-root
        data-has-faq="false"
        role="alert"
      >
        This article&apos;s content could not be loaded. Please try again later or contact support if the issue persists.
      </div>
    );
  }
  const rawBlocks = content.blocks;
  if (rawBlocks != null && !Array.isArray(rawBlocks)) {
    console.error("[BlogContentRenderer] Invalid blocks structure — expected array", typeof rawBlocks);
  }
  const blocks = Array.isArray(rawBlocks) ? rawBlocks : [];
  const hasFaq = blocks.some((b) => b.type === "faq");

  if (blocks.length === 0) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[BlogContentRenderer] No blocks to render (invalid or empty content_json after parse).");
    }
    return (
      <div
        className="blog-body mx-auto max-w-[65ch] rounded-lg border border-amber-200 bg-amber-50/80 px-4 py-6 text-sm text-amber-950"
        data-blog-content-root
        data-has-faq="false"
        role="status"
      >
        Content is unavailable for this article. If you edit the post in the admin CMS, ensure{" "}
        <code className="rounded bg-amber-100 px-1 py-0.5 text-xs">content_json</code> matches the block schema (see{" "}
        <code className="rounded bg-amber-100 px-1 py-0.5 text-xs">blogContentJsonSchema</code>).
      </div>
    );
  }

  return (
    <div
      className="blog-body mx-auto w-full max-w-[65ch] space-y-8 sm:space-y-10 lg:space-y-12"
      data-blog-content-root
      data-has-faq={hasFaq ? "true" : "false"}
    >
      {blocks.map((block, i) => (
        <Block
          key={block.id ?? `${block.type}-${i + blockIndexOffset}`}
          block={block}
          index={i}
          blockIndexOffset={blockIndexOffset}
          autoLinkSlug={autoLinkSlug}
        />
      ))}
    </div>
  );
}
