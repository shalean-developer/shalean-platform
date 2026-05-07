"use client";

import { useEffect, useState } from "react";

function measureArticleProgressPct(): number {
  const root = document.querySelector("[data-blog-article-root]") as HTMLElement | null;
  if (!root) return 0;
  const rect = root.getBoundingClientRect();
  const scrollY = window.scrollY;
  const top = rect.top + scrollY;
  const height = root.offsetHeight;
  const vh = window.innerHeight;
  const denom = Math.max(height - vh * 0.45, 1);
  const num = scrollY - top + vh * 0.12;
  return Math.min(100, Math.max(0, (num / denom) * 100));
}

/** Thin fixed bar — long-form reading completion cue (TOC or ≥6 min read). */
export function BlogReadingProgressBar() {
  const [pct, setPct] = useState(0);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setPct(measureArticleProgressPct()));
    };
    tick();
    window.addEventListener("scroll", tick, { passive: true });
    window.addEventListener("resize", tick);
    return () => {
      window.removeEventListener("scroll", tick);
      window.removeEventListener("resize", tick);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-1 bg-zinc-200/50 dark:bg-zinc-800/60"
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label="Article read progress"
    >
      <div
        className="h-full bg-blue-600 transition-[width] duration-150 ease-out will-change-[width] dark:bg-blue-500"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
