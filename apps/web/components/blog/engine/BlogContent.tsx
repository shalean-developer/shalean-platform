import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type Props = {
  children: ReactNode;
  /** When true, wraps children in Tailwind Typography `prose` (avoid nesting if children already include prose). */
  prose?: boolean;
  className?: string;
};

/**
 * Readable column: optional `prose` + hard cap ~65ch inside main column.
 */
export function BlogContent({ children, prose = false, className }: Props) {
  return (
    <div
      className={cn(
        "mx-auto w-full max-w-[65ch]",
        prose &&
          "prose prose-base prose-zinc max-w-none leading-relaxed md:prose-lg prose-headings:scroll-mt-28 prose-headings:font-semibold prose-headings:text-zinc-900 prose-a:text-blue-700 prose-a:no-underline hover:prose-a:underline prose-li:marker:text-blue-600",
        className,
      )}
    >
      {children}
    </div>
  );
}
