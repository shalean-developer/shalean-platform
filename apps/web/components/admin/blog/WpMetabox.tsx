"use client";

import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type Props = {
  title: string;
  children: ReactNode;
  className?: string;
  defaultOpen?: boolean;
};

/** WordPress-style sidebar metabox panel. */
export function WpMetabox({ title, children, className, defaultOpen = true }: Props) {
  return (
    <details
      open={defaultOpen}
      className={cn(
        "group overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-700 dark:bg-zinc-950",
        className,
      )}
    >
      <summary className="flex items-center justify-between gap-2 cursor-pointer list-none border-b border-zinc-200 bg-zinc-50 px-3 py-2.5 text-[13px] font-semibold text-zinc-800 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 [&::-webkit-details-marker]:hidden">
        {title}<ChevronDown className="h-4 w-4 shrink-0 text-zinc-500 transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <div className="space-y-3 px-3 py-3 text-sm">{children}</div>
    </details>
  );
}
