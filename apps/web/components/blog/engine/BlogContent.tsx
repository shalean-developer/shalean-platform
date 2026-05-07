import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type Props = {
  children: ReactNode;
  /** When true, wraps children in Tailwind Typography `prose` (avoid nesting if children already include prose). */
  prose?: boolean;
  className?: string;
};

/**
 * Readable column: optional Tailwind Typography `prose` (~65ch) for long-form articles.
 * Use `not-prose` on CTAs, cards, and widgets inside children to avoid double-styling.
 */
export function BlogContent({ children, prose = false, className }: Props) {
  return (
    <div
      className={cn(
        "mx-auto w-full max-w-[65ch]",
        prose &&
          [
            "prose prose-lg prose-zinc leading-relaxed",
            "prose-headings:scroll-mt-28 prose-headings:font-bold prose-headings:text-zinc-900 prose-headings:tracking-tight",
            "prose-h2:mt-10 prose-h2:mb-4",
            "prose-h3:mt-8 prose-h3:mb-3",
            "prose-p:text-zinc-600 prose-p:leading-relaxed",
            "prose-a:font-medium prose-a:text-blue-700 prose-a:no-underline hover:prose-a:underline prose-a:underline-offset-4",
            "prose-li:marker:text-blue-600",
          ].join(" "),
        className,
      )}
    >
      {children}
    </div>
  );
}
