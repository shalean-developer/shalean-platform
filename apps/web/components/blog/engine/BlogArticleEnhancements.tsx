"use client";

import { ArrowUp } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/utils";

type Props = {
  /** Marker for scroll root — matches `[data-blog-article-root]` on layout. */
  articleSelector?: string;
};

export function BlogArticleEnhancements({ articleSelector = "[data-blog-article-root]" }: Props) {
  const [progress, setProgress] = useState(0);
  const [showTop, setShowTop] = useState(false);

  const onScroll = useCallback(() => {
    const doc = document.documentElement;
    const scrollable = doc.scrollHeight - doc.clientHeight;
    const p = scrollable > 0 ? Math.min(100, (doc.scrollTop / scrollable) * 100) : 0;
    setProgress(p);
    setShowTop(doc.scrollTop > 420);
  }, []);

  useEffect(() => {
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, [onScroll]);

  const scrollTop = () => {
    const root = document.querySelector(articleSelector);
    if (root instanceof HTMLElement) {
      root.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <>
      <div
        className="pointer-events-none fixed inset-x-0 top-0 z-[60] h-1 bg-zinc-200/80"
        aria-hidden
      >
        <div
          className="h-full bg-blue-600 transition-[width] duration-150 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>

      <button
        type="button"
        onClick={scrollTop}
        className={cn(
          "fixed bottom-24 right-4 z-[45] flex size-12 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-700 shadow-lg transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-900 lg:bottom-28",
          showTop ? "opacity-100 translate-y-0" : "pointer-events-none opacity-0 translate-y-2",
        )}
        aria-label="Back to top"
      >
        <ArrowUp className="size-5" />
      </button>
    </>
  );
}
