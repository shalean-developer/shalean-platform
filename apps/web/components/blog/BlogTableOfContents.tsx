"use client";

import type { BlogTocEntry } from "@/lib/blog/extract-blog-toc";
import { BLOG_TOC_ACTIVE_EVENT } from "@/lib/blog/blog-toc-active-event";
import { recordTocSectionEngagementFromTocClick } from "@/lib/blog/blog-toc-section-engagement";
import { ANALYTICS_EVENTS } from "@/lib/analytics/userEventRegistry";
import { trackGrowthEvent } from "@/lib/growth/trackEvent";
import { cn } from "@/lib/utils";
import { useLayoutEffect, useEffect, useState, useRef } from "react";

/** Aligns with `scroll-mt-28` (7rem) on in-page anchors so the active row matches visible headings. */
const BLOG_TOC_SCROLL_OFFSET_PX = 112;

export { BLOG_TOC_ACTIVE_EVENT } from "@/lib/blog/blog-toc-active-event";

export function computeBlogTocActiveId(items: BlogTocEntry[]): string {
  let active = items[0]?.id ?? "";
  if (typeof document === "undefined") return active;
  for (const item of items) {
    const el = document.getElementById(item.id);
    if (!el) continue;
    if (el.getBoundingClientRect().top <= BLOG_TOC_SCROLL_OFFSET_PX) active = item.id;
  }
  return active;
}

type ItemsProps = {
  items: BlogTocEntry[];
  trackingSlug: string;
};

function BlogTocList({ items, trackingSlug }: ItemsProps) {
  const [activeId, setActiveId] = useState(() => items[0]?.id ?? "");

  useLayoutEffect(() => {
    setActiveId(computeBlogTocActiveId(items));
  }, [items]);

  useEffect(() => {
    const onActive = (e: Event) => {
      const ce = e as CustomEvent<{ activeId?: string }>;
      const next = ce.detail?.activeId;
      if (typeof next === "string" && next.length > 0) setActiveId(next);
    };
    window.addEventListener(BLOG_TOC_ACTIVE_EVENT, onActive);
    return () => window.removeEventListener(BLOG_TOC_ACTIVE_EVENT, onActive);
  }, []);

  return (
    <ul className="space-y-1.5 border-l-2 border-zinc-200 pl-3">
      {items.map((item) => {
        const isActive = activeId === item.id;
        return (
          <li key={item.id} className={cn(item.level === 3 && "pl-2")}>
            <a
              href={`#${item.id}`}
              onClick={() => {
                trackGrowthEvent(ANALYTICS_EVENTS.BLOG_TOC_CLICK, {
                  slug: trackingSlug,
                  heading: item.label,
                  heading_depth: item.level,
                  toc_target_id: item.id,
                });
                recordTocSectionEngagementFromTocClick(trackingSlug, {
                  id: item.id,
                  label: item.label,
                  level: item.level,
                });
              }}
              className={cn(
                "inline-flex min-h-9 scroll-mt-28 items-center rounded-r-md px-1.5 py-0.5 text-sm leading-snug underline-offset-4 transition-colors duration-150",
                isActive
                  ? "bg-blue-50/90 font-medium text-blue-900"
                  : "text-zinc-600 hover:text-blue-800 hover:underline",
              )}
            >
              {item.label}
            </a>
          </li>
        );
      })}
    </ul>
  );
}

const NAV_KEYS = new Set(["ArrowDown", "ArrowUp", "PageDown", "PageUp", " ", "Home", "End"]);

/**
 * Single scroll listener for the post — dispatches `BLOG_TOC_ACTIVE_EVENT` so inline + sidebar
 * TOC lists stay in sync without duplicate observers.
 */
export function BlogTocScrollHub({ items }: { items: BlogTocEntry[] }) {
  const lastActiveRef = useRef<string>("");
  /** Valid `#id` on load that matches a TOC row — `replaceState` is skipped until the reader interacts. */
  const landingHashIdRef = useRef<string | null>(null);
  const hashSyncUnlockedRef = useRef(false);
  /** After layout + deep-link scroll settle, used to detect real scroll moves (e.g. scrollbar drag). */
  const scrollBaselineYRef = useRef<number | null>(null);

  useLayoutEffect(() => {
    scrollBaselineYRef.current = null;
    if (typeof window === "undefined" || items.length < 2) {
      landingHashIdRef.current = null;
      return;
    }
    const raw = window.location.hash.replace(/^#/, "");
    const id = raw ? decodeURIComponent(raw) : "";
    landingHashIdRef.current = id.length > 0 && items.some((i) => i.id === id) ? id : null;
    hashSyncUnlockedRef.current = false;
  }, [items]);

  useEffect(() => {
    if (items.length < 2) return;

    let raf = 0;
    const run = () => {
      const activeId = computeBlogTocActiveId(items);
      if (activeId === lastActiveRef.current) return;
      lastActiveRef.current = activeId;

      const landing = landingHashIdRef.current;
      const unlocked = hashSyncUnlockedRef.current;
      const shouldSyncHash =
        unlocked ||
        !landing ||
        activeId === landing ||
        (typeof window !== "undefined" && window.location.hash.replace(/^#/, "") === activeId);

      if (
        shouldSyncHash &&
        typeof window.history.replaceState === "function" &&
        activeId.length > 0
      ) {
        const next = `#${activeId}`;
        if (window.location.hash !== next) {
          window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}${next}`);
        }
      }

      window.dispatchEvent(new CustomEvent(BLOG_TOC_ACTIVE_EVENT, { detail: { activeId } }));
    };

    const unlockHashSync = () => {
      if (hashSyncUnlockedRef.current) return;
      hashSyncUnlockedRef.current = true;
      lastActiveRef.current = "";
      run();
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (NAV_KEYS.has(e.key)) unlockHashSync();
    };

    document.addEventListener("wheel", unlockHashSync, { passive: true });
    document.addEventListener("touchstart", unlockHashSync, { passive: true });
    document.addEventListener("pointerdown", unlockHashSync);
    window.addEventListener("keydown", onKeyDown);

    const onScrollOrResize = () => {
      if (!hashSyncUnlockedRef.current && scrollBaselineYRef.current != null) {
        if (Math.abs(window.scrollY - scrollBaselineYRef.current) > 24) {
          unlockHashSync();
        }
      }
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(run);
    };

    lastActiveRef.current = "";
    run();
    const baselineTimer = window.setTimeout(() => {
      scrollBaselineYRef.current = window.scrollY;
    }, 400);
    window.addEventListener("scroll", onScrollOrResize, { passive: true });
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      window.clearTimeout(baselineTimer);
      document.removeEventListener("wheel", unlockHashSync);
      document.removeEventListener("touchstart", unlockHashSync);
      document.removeEventListener("pointerdown", unlockHashSync);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", onScrollOrResize);
      window.removeEventListener("resize", onScrollOrResize);
      cancelAnimationFrame(raf);
    };
  }, [items]);

  return null;
}

/** Collapsible TOC under the hero — mobile / tablet only. */
export function BlogTableOfContentsInline({
  items,
  trackingSlug,
  className,
}: ItemsProps & { className?: string }) {
  const [activeSectionLabel, setActiveSectionLabel] = useState(() => items[0]?.label ?? "");

  useEffect(() => {
    const onActive = (e: Event) => {
      const ce = e as CustomEvent<{ activeId?: string }>;
      const id = ce.detail?.activeId;
      if (typeof id !== "string" || !id) return;
      const row = items.find((i) => i.id === id);
      if (row) setActiveSectionLabel(row.label);
    };
    window.addEventListener(BLOG_TOC_ACTIVE_EVENT, onActive);
    return () => window.removeEventListener(BLOG_TOC_ACTIVE_EVENT, onActive);
  }, [items]);

  if (items.length < 2) return null;

  return (
    <details
      className={cn(
        "group rounded-xl border border-zinc-200/90 bg-zinc-50/90 px-4 py-3 shadow-sm lg:hidden",
        className,
      )}
    >
      <summary className="flex cursor-pointer list-none flex-wrap items-baseline gap-x-2 gap-y-1 text-sm font-semibold text-zinc-900 [&::-webkit-details-marker]:hidden">
        <span className="shrink-0">On this page</span>
        {activeSectionLabel ? (
          <span className="group-open:hidden min-w-0 max-w-[min(100%,18rem)] truncate text-xs font-semibold text-blue-800">
            · {activeSectionLabel}
          </span>
        ) : null}
        <span className="text-xs font-normal text-zinc-500 group-open:hidden">(tap to expand)</span>
      </summary>
      <div className="mt-4 pb-1">
        <BlogTocList items={items} trackingSlug={trackingSlug} />
      </div>
    </details>
  );
}

/** Sticky sidebar card — large screens only (column wrapper supplies `lg:sticky`). */
export function BlogTableOfContentsSidebar({
  items,
  trackingSlug,
  className,
}: ItemsProps & { className?: string }) {
  if (items.length < 2) return null;

  return (
    <nav
      aria-label="On this page"
      className={cn(
        "hidden min-w-[280px] max-w-[320px] rounded-xl border border-zinc-200/90 bg-white p-5 shadow-sm lg:block",
        className,
      )}
    >
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-500">On this page</p>
      <div className="max-h-[min(70vh,22rem)] overflow-y-auto overscroll-contain pr-1">
        <BlogTocList items={items} trackingSlug={trackingSlug} />
      </div>
    </nav>
  );
}
