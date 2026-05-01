"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Matches `top-24` on the sticky wrapper (6rem). */
const STICKY_TOP_PX = 96;

type BookingCheckoutSidebarStickyPanelProps = {
  children: ReactNode;
};

/**
 * Sentinel + scroll-driven “pinned” state. Outer shell: rounded clip + border/shadow;
 * inner: scroll only (avoids flat corners from `rounded-*` + `overflow-y-auto` on one node).
 */
export function BookingCheckoutSidebarStickyPanel({ children }: BookingCheckoutSidebarStickyPanelProps) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [stuck, setStuck] = useState(false);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;

    const update = () => {
      const top = el.getBoundingClientRect().top;
      setStuck(top < STICKY_TOP_PX);
    };

    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  return (
    <>
      <div ref={sentinelRef} className="pointer-events-none h-px w-full shrink-0" aria-hidden />
      <div className="sticky top-24">
        {/* Visual layer: corners + clip (no vertical scroll here) */}
        <div
          className={cn(
            "relative overflow-hidden rounded-2xl border border-gray-200 bg-white/90 backdrop-blur-sm transition-all duration-300 ease-out dark:border-zinc-700",
            stuck ? "shadow-md ring-1 ring-gray-200 dark:ring-zinc-600" : "shadow-sm",
            stuck &&
              "before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:z-[1] before:h-3 before:bg-gradient-to-b before:from-white/80 before:to-transparent dark:before:from-zinc-900/80",
          )}
        >
          {/* Scroll layer: all overflow-y scrolling */}
          <div className="scrollbar-hide max-h-[calc(100vh-120px)] overflow-y-auto overscroll-contain scroll-smooth pr-1">
            {children}
          </div>
        </div>
      </div>
    </>
  );
}
