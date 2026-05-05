"use client";

import Image from "next/image";
import Link from "next/link";
import { blogFaqHeadingDomId, defaultBlogBlockAnchorId } from "@/lib/blog/blog-block-anchors";
import type { BlogContentBlock, BlogContentJson } from "@/lib/blog/content-json";
import { injectMarkdownAutoLinks } from "@/lib/blog/seo/auto-link-keywords";
import { sanitizeBlogRichHtml } from "@/lib/blog/sanitize-blog-html";
import { cn } from "@/lib/utils";
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
};

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
  const body = autoLinkSlug ? injectMarkdownAutoLinks(text) : text;
  const re = /\[([^\]]+)\]\(([^)]+)\)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(body)) !== null) {
    if (m.index > last) {
      parts.push(body.slice(last, m.index));
    }
    parts.push(
      <Link key={`${k++}-${m.index}`} href={m[2]} className={linkClass}>
        {m[1]}
      </Link>,
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
  children,
}: {
  id?: string;
  level: 1 | 2 | 3;
  children: React.ReactNode;
}) {
  const base = "scroll-mt-28 font-bold tracking-tight text-zinc-900 max-w-none";
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
  autoLinkSlug,
}: {
  block: BlogContentBlock;
  index: number;
  autoLinkSlug?: string;
}) {
  switch (block.type) {
    case "intro":
      return (
        <p
          id={block.id}
          className="max-w-prose text-base leading-relaxed text-zinc-700 sm:text-[1.0625rem] sm:leading-[1.65]"
        >
          {block.content}
        </p>
      );

    case "quick_answer":
      return (
        <aside
          id={block.id}
          className="rounded-xl border border-blue-100 bg-blue-50/80 px-4 py-4 text-zinc-800 shadow-sm sm:px-6 sm:py-5"
          aria-label="Quick answer"
        >
          <p className="whitespace-pre-line text-base leading-relaxed font-medium text-zinc-900">{block.content}</p>
        </aside>
      );

    case "section": {
      const raw = block.heading_level ?? 2;
      const level: 2 | 3 | 4 = raw === 3 || raw === 4 ? raw : 2;
      return (
        <section id={block.id ?? defaultBlogBlockAnchorId(block, index)} className="scroll-mt-28 space-y-4">
          <SectionHeading
            level={level}
            className="text-xl font-semibold tracking-tight text-zinc-900 sm:text-2xl"
          >
            {block.title}
          </SectionHeading>
          <p className="max-w-prose text-[15px] leading-[1.7] text-zinc-600 sm:text-base sm:leading-relaxed whitespace-pre-line">
            {block.content}
          </p>
        </section>
      );
    }

    case "comparison":
      return (
        <div
          id={block.id}
          className="divide-y divide-zinc-200 overflow-hidden rounded-xl border border-zinc-200 bg-zinc-50/60"
          role="list"
          aria-label="Comparison"
        >
          {block.items.map((item) => (
            <div key={item.label} role="listitem" className="px-4 py-3.5 sm:px-5 sm:py-4">
              <p className="text-sm font-semibold text-zinc-900">{item.label}</p>
              <p className="mt-1.5 text-sm leading-relaxed text-zinc-600">{item.value}</p>
            </div>
          ))}
        </div>
      );

    case "comparison_table": {
      const cols = Array.isArray(block.columns) ? block.columns : [];
      const rows = Array.isArray(block.rows) ? block.rows : [];
      return (
        <div
          id={block.id}
          className="-mx-4 min-w-0 max-w-full touch-pan-x overflow-x-auto overscroll-x-contain px-4 sm:mx-0 sm:px-0"
        >
          <table className="w-full min-w-[280px] border-collapse text-left text-sm text-zinc-700">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50">
                {cols.map((col, i) => (
                  <th
                    key={i}
                    scope="col"
                    className="px-3 py-3 font-semibold text-zinc-900 first:rounded-tl-lg last:rounded-tr-lg sm:px-4"
                  >
                    {col || "—"}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, ri) => (
                <tr key={ri} className="border-b border-zinc-100 last:border-0">
                  {(Array.isArray(row) ? row : []).map((cell, ci) => (
                    <td key={ci} className="px-3 py-3 align-top sm:px-4">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    case "bullets":
      return (
        <section id={block.id} className="space-y-3" aria-label={block.title ?? "Bullet list"}>
          {block.title ? (
            <h3 className="text-lg font-semibold text-zinc-900">{block.title}</h3>
          ) : null}
          <ul className="list-disc space-y-2.5 pl-5 text-[15px] leading-relaxed text-zinc-600 marker:text-blue-600 sm:text-base">
            {block.items.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </section>
      );

    case "cta":
      return (
        <aside
          id={block.id}
          className={cn(
            "rounded-2xl border p-6 shadow-sm sm:p-8",
            block.variant === "secondary"
              ? "border-zinc-200 bg-zinc-50"
              : "border-blue-100 bg-gradient-to-br from-blue-50 to-white",
          )}
          aria-label="Call to action"
        >
          <h3 className="text-xl font-semibold tracking-tight text-zinc-900">{block.title}</h3>
          {block.description ? (
            <p className="mt-2 text-sm leading-relaxed text-zinc-600">{block.description}</p>
          ) : null}
          <div className="mt-5">
            <Button asChild size="lg" variant={block.variant === "secondary" ? "secondary" : "default"}>
              <Link href={block.link}>{block.button_text}</Link>
            </Button>
          </div>
        </aside>
      );

    case "faq": {
      const faqItems = Array.isArray(block.items) ? block.items : [];
      const headingId = blogFaqHeadingDomId(block, index);
      const accordion = (
        <Accordion type="single" collapsible className="mt-4 w-full">
          {faqItems.map((item, i) => (
            <AccordionItem value={`faq-${index}-${i}`} key={i}>
              <AccordionTrigger className="text-left text-base">{item.question}</AccordionTrigger>
              <AccordionContent className="text-base leading-relaxed text-zinc-600">
                {item.answer}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      );
      if (block.omit_section_heading) {
        return (
          <section
            id={block.id ?? `blog-faq-${index}`}
            className="scroll-mt-24"
            aria-label="Frequently asked questions"
          >
            {accordion}
          </section>
        );
      }
      return (
        <section
          id={block.id ?? `blog-faq-${index}`}
          className="scroll-mt-24"
          aria-labelledby={headingId}
        >
          <h2 id={headingId} className="text-xl font-semibold tracking-tight text-zinc-900 sm:text-2xl">
            Frequently asked questions
          </h2>
          {accordion}
        </section>
      );
    }

    case "rich_text": {
      const safe = sanitizeBlogRichHtml(block.html);
      return (
        <div
          id={block.id}
          className={cn(
            "blog-rich-text prose prose-lg prose-zinc max-w-none text-zinc-700",
            "prose-headings:scroll-mt-28 prose-headings:font-bold prose-headings:text-zinc-900",
            "prose-h2:text-2xl prose-h2:sm:text-3xl prose-h3:text-xl prose-h3:sm:text-2xl",
            "prose-a:font-medium prose-a:text-blue-600 prose-a:underline prose-a:underline-offset-4 prose-a:hover:text-blue-700",
            "prose-ul:marker:text-blue-600 prose-ol:marker:text-blue-600",
          )}
          data-block-type="rich_text"
          dangerouslySetInnerHTML={{ __html: safe }}
        />
      );
    }

    case "paragraph":
      return (
        <ParagraphWithOptionalInlineLinks
          id={block.id}
          className="max-w-prose text-[15px] leading-[1.7] text-zinc-600 sm:text-base sm:leading-relaxed whitespace-pre-line"
          text={block.content}
          autoLinkSlug={autoLinkSlug}
        />
      );

    case "heading":
      return (
        <ArticleHeading id={block.id ?? defaultBlogBlockAnchorId(block, index)} level={block.level}>
          {block.content}
        </ArticleHeading>
      );

    case "bullet_list":
      return (
        <section id={block.id} className="space-y-3" aria-label={block.title ?? "Bullet list"}>
          {block.title ? (
            <h3 className="text-lg font-semibold text-zinc-900">{block.title}</h3>
          ) : null}
          <ul className="list-disc space-y-2.5 pl-5 text-[15px] leading-relaxed text-zinc-600 marker:text-blue-600 sm:text-base">
            {block.items.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </section>
      );

    case "numbered_list":
      return (
        <section id={block.id} className="space-y-3" aria-label={block.title ?? "Numbered list"}>
          {block.title ? (
            <h3 className="text-lg font-semibold text-zinc-900">{block.title}</h3>
          ) : null}
          <ol className="list-decimal space-y-2.5 pl-5 text-[15px] leading-relaxed text-zinc-600 marker:text-blue-600 sm:text-base">
            {block.items.map((item, i) => (
              <li key={i} className="pl-1">
                {item}
              </li>
            ))}
          </ol>
        </section>
      );

    case "key_takeaways":
      return (
        <aside
          id={block.id}
          className="rounded-xl border border-amber-100 bg-amber-50/60 px-4 py-4 sm:px-6 sm:py-5"
          aria-label="Key takeaways"
        >
          <p className="text-sm font-semibold uppercase tracking-wide text-amber-900/90">Key takeaways</p>
          <ul className="mt-3 list-disc space-y-2.5 pl-5 text-[15px] leading-relaxed text-zinc-800 marker:text-amber-700 sm:text-base">
            {block.items.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </aside>
      );

    case "image": {
      if (!block.url?.trim()) {
        return null;
      }
      const remote = isRemoteSrc(block.url);
      return (
        <figure id={block.id} className="my-2 w-full space-y-2">
          <div className="relative aspect-[16/9] w-full overflow-hidden rounded-2xl bg-zinc-100 ring-1 ring-zinc-200/60 shadow-sm">
            <Image
              src={block.url}
              alt={block.alt}
              fill
              className="object-cover"
              sizes="(max-width: 1024px) 100vw, 672px"
              loading={block.priority ? undefined : "lazy"}
              priority={block.priority}
              unoptimized={remote}
            />
          </div>
          {block.caption ? (
            <figcaption className="text-center text-sm text-zinc-500">{block.caption}</figcaption>
          ) : null}
        </figure>
      );
    }

    case "quote":
      return (
        <blockquote
          id={block.id}
          className="border-l-4 border-blue-500 bg-zinc-50 py-4 pl-5 pr-4 text-lg italic leading-relaxed text-zinc-800"
        >
          <p>{block.content}</p>
          {block.attribution ? (
            <footer className="mt-3 text-sm font-medium not-italic text-zinc-600">— {block.attribution}</footer>
          ) : null}
        </blockquote>
      );

    case "internal_links": {
      const links = Array.isArray(block.links) ? block.links : [];
      return (
        <nav id={block.id} className="space-y-3" aria-label={block.title ?? "Related links"}>
          {block.title ? (
            <h3 className="text-lg font-semibold text-zinc-900">{block.title}</h3>
          ) : null}
          <ul className="space-y-2">
            {links.map((l) => (
              <li key={l.url + l.label}>
                <Link
                  href={l.url}
                  className="text-base font-medium text-blue-600 underline-offset-4 hover:text-blue-700 hover:underline"
                >
                  {l.label}
                </Link>
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
          className="space-y-4 rounded-2xl border border-blue-100 bg-blue-50/35 px-5 py-5 sm:px-6"
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

export function BlogContentRenderer({ content, autoLinkSlug }: Props) {
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
      className="blog-body mx-auto w-full max-w-[65ch] space-y-8 text-[1.0625rem] leading-relaxed text-zinc-700 sm:space-y-10 sm:text-[1.0625rem] lg:space-y-12"
      data-blog-content-root
      data-has-faq={hasFaq ? "true" : "false"}
    >
      {blocks.map((block, i) => (
        <Block key={block.id ?? `${block.type}-${i}`} block={block} index={i} autoLinkSlug={autoLinkSlug} />
      ))}
    </div>
  );
}
