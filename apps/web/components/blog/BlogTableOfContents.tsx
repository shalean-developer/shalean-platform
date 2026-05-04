"use client";

import type { BlogTocEntry } from "@/lib/blog/extract-blog-toc";
import { cn } from "@/lib/utils";

type Props = {
  items: BlogTocEntry[];
  className?: string;
};

function TocList({ items }: { items: BlogTocEntry[] }) {
  return (
    <ul className="space-y-2 border-l-2 border-blue-100 pl-3">
      {items.map((item) => (
        <li key={item.id} className={cn(item.level === 3 && "pl-3")}>
          <a
            href={`#${item.id}`}
            className="inline-flex min-h-10 items-center text-sm leading-snug text-zinc-600 underline-offset-4 hover:text-blue-700 hover:underline"
          >
            {item.label}
          </a>
        </li>
      ))}
    </ul>
  );
}

/** Responsive TOC: collapsible on small screens, sticky sidebar on large. */
export function BlogTableOfContents({ items, className }: Props) {
  if (items.length < 2) return null;

  return (
    <div className={cn(className)}>
      <details className="group rounded-xl border border-zinc-200 bg-zinc-50/90 px-4 py-3 lg:hidden">
        <summary className="cursor-pointer list-none text-sm font-semibold text-zinc-900 [&::-webkit-details-marker]:hidden">
          On this page
          <span className="ml-2 text-xs font-normal text-zinc-500 group-open:hidden">(tap to expand)</span>
        </summary>
        <div className="mt-4 pb-1">
          <TocList items={items} />
        </div>
      </details>

      <nav aria-label="On this page" className="hidden lg:block">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-500">On this page</p>
        <div className="max-h-[calc(100vh-8rem)] overflow-y-auto overscroll-contain pr-1">
          <TocList items={items} />
        </div>
      </nav>
    </div>
  );
}
