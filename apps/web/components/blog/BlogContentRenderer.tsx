"use client";

import Image from "next/image";
import Link from "next/link";
import type { BlogContentBlock, BlogContentJson } from "@/lib/blog/content-json";
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

function Block({ block, index }: { block: BlogContentBlock; index: number }) {
  switch (block.type) {
    case "intro":
      return (
        <p
          id={block.id}
          className="text-lg leading-relaxed text-zinc-700 sm:text-xl sm:leading-relaxed"
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
          <p className="text-base leading-relaxed font-medium text-zinc-900">{block.content}</p>
        </aside>
      );

    case "section": {
      const raw = block.heading_level ?? 2;
      const level: 2 | 3 | 4 = raw === 3 || raw === 4 ? raw : 2;
      return (
        <section id={block.id} className="space-y-3 scroll-mt-24">
          <SectionHeading
            level={level}
            className="text-xl font-semibold tracking-tight text-zinc-900 sm:text-2xl"
          >
            {block.title}
          </SectionHeading>
          <p className="text-base leading-relaxed text-zinc-600 whitespace-pre-line">{block.content}</p>
        </section>
      );
    }

    case "comparison":
      return (
        <div
          id={block.id}
          className="grid gap-4 sm:grid-cols-2"
          role="list"
          aria-label="Comparison"
        >
          {block.items.map((item) => (
            <div
              key={item.label}
              role="listitem"
              className="rounded-xl border border-zinc-200 bg-zinc-50/80 p-4 shadow-sm"
            >
              <p className="text-sm font-semibold text-zinc-900">{item.label}</p>
              <p className="mt-2 text-sm leading-relaxed text-zinc-600">{item.value}</p>
            </div>
          ))}
        </div>
      );

    case "comparison_table":
      return (
        <div
          id={block.id}
          className="-mx-4 min-w-0 max-w-full touch-pan-x overflow-x-auto overscroll-x-contain px-4 sm:mx-0 sm:px-0"
        >
          <table className="w-full min-w-[280px] border-collapse text-left text-sm text-zinc-700">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50">
                {block.columns.map((col, i) => (
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
              {block.rows.map((row, ri) => (
                <tr key={ri} className="border-b border-zinc-100 last:border-0">
                  {row.map((cell, ci) => (
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

    case "bullets":
      return (
        <section id={block.id} className="space-y-3" aria-label={block.title ?? "Bullet list"}>
          {block.title ? (
            <h3 className="text-lg font-semibold text-zinc-900">{block.title}</h3>
          ) : null}
          <ul className="list-disc space-y-2 pl-5 text-base leading-relaxed text-zinc-600 marker:text-blue-600">
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
      const headingId = `blog-faq-heading-${index}`;
      return (
        <section
          id={block.id ?? `blog-faq-${index}`}
          className="scroll-mt-24"
          aria-labelledby={headingId}
        >
          <h2 id={headingId} className="text-xl font-semibold tracking-tight text-zinc-900 sm:text-2xl">
            Frequently asked questions
          </h2>
          <Accordion type="single" collapsible className="mt-4 w-full">
            {block.items.map((item, i) => (
              <AccordionItem value={`faq-${index}-${i}`} key={i}>
                <AccordionTrigger className="text-left text-base">{item.question}</AccordionTrigger>
                <AccordionContent className="text-base leading-relaxed text-zinc-600">
                  {item.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </section>
      );
    }

    case "paragraph":
      return (
        <p id={block.id} className="text-base leading-relaxed text-zinc-600 whitespace-pre-line">
          {block.content}
        </p>
      );

    case "key_takeaways":
      return (
        <aside
          id={block.id}
          className="rounded-xl border border-amber-100 bg-amber-50/60 px-4 py-4 sm:px-6 sm:py-5"
          aria-label="Key takeaways"
        >
          <p className="text-sm font-semibold uppercase tracking-wide text-amber-900/90">Key takeaways</p>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-base leading-relaxed text-zinc-800 marker:text-amber-700">
            {block.items.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </aside>
      );

    case "image": {
      const remote = isRemoteSrc(block.url);
      return (
        <figure id={block.id} className="space-y-2">
          <div className="relative aspect-[16/10] w-full overflow-hidden rounded-xl bg-zinc-100 ring-1 ring-zinc-200/60">
            <Image
              src={block.url}
              alt={block.alt}
              fill
              className="object-cover"
              sizes="(max-width: 768px) 100vw, 768px"
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

    case "internal_links":
      return (
        <nav id={block.id} className="space-y-3" aria-label={block.title ?? "Related links"}>
          {block.title ? (
            <h3 className="text-lg font-semibold text-zinc-900">{block.title}</h3>
          ) : null}
          <ul className="space-y-2">
            {block.links.map((l) => (
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

    case "service_area":
      return (
        <section id={block.id} className="space-y-3" aria-label="Service areas">
          <h3 className="text-lg font-semibold text-zinc-900">Areas we cover</h3>
          <div className="flex flex-wrap gap-2">
            {block.locations.map((loc) => (
              <span
                key={loc}
                className="inline-flex items-center rounded-full border border-zinc-200 bg-white px-3 py-1 text-sm text-zinc-700"
              >
                {loc}
              </span>
            ))}
          </div>
        </section>
      );

  }
}

export function BlogContentRenderer({ content }: Props) {
  const hasFaq = content.blocks.some((b) => b.type === "faq");

  return (
    <div
      className="prose prose-zinc max-w-none space-y-10 prose-p:my-0 prose-headings:scroll-mt-24"
      data-blog-content-root
      data-has-faq={hasFaq ? "true" : "false"}
    >
      {content.blocks.map((block, i) => (
        <Block key={block.id ?? `${block.type}-${i}`} block={block} index={i} />
      ))}
    </div>
  );
}
