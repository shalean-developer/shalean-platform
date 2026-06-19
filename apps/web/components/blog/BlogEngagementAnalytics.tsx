"use client";

import { useEffect, useRef } from "react";
import {
  flushTocSectionEngagementForLeave,
  getCurrentTocEngagementSnapshot,
  updateTocSectionEngagementScrollPct,
} from "@/lib/blog/blog-toc-section-engagement";
import { ANALYTICS_EVENTS } from "@/lib/analytics/userEventRegistry";
import { trackGrowthEvent } from "@/lib/growth/trackEvent";

type Props = {
  slug: string;
};

/**
 * Scroll depth (25/50/75/100), dwell milestones, and delegated CTA clicks inside the article surface.
 */
export function BlogEngagementAnalytics({ slug }: Props) {
  const milestones = useRef(new Set<number>());
  const dwellSent = useRef(new Set<number>());
  const leaveSent = useRef(false);
  const startedAt = useRef<number>(typeof performance !== "undefined" ? performance.now() : Date.now());

  useEffect(() => {
    const articleRoot = document.querySelector("[data-blog-article-root]");
    if (!articleRoot) return;

    const stickyHost = document.querySelector("[data-blog-sticky-cta]");

    const onScroll = () => {
      const doc = document.documentElement;
      const scrollable = doc.scrollHeight - doc.clientHeight;
      if (scrollable <= 0) return;
      const pct = Math.min(100, Math.round((doc.scrollTop / scrollable) * 100));
      updateTocSectionEngagementScrollPct(slug, pct);
      for (const m of [25, 50, 75, 100] as const) {
        if (pct >= m && !milestones.current.has(m)) {
          milestones.current.add(m);
          trackGrowthEvent(ANALYTICS_EVENTS.BLOG_SCROLL, { slug, depth: m });
        }
      }
    };

    const tickDwell = () => {
      const elapsedSec = Math.round((performance.now() - startedAt.current) / 1000);
      for (const s of [30, 90, 180] as const) {
        if (elapsedSec >= s && !dwellSent.current.has(s)) {
          dwellSent.current.add(s);
          trackGrowthEvent(ANALYTICS_EVENTS.BLOG_TIME_ON_PAGE, { slug, seconds: s, milestone: true });
        }
      }
    };

    const interval = window.setInterval(tickDwell, 4000);

    const flushTotal = () => {
      if (leaveSent.current) return;
      const seconds = Math.round((performance.now() - startedAt.current) / 1000);
      if (seconds < 5) return;
      leaveSent.current = true;
      trackGrowthEvent(ANALYTICS_EVENTS.BLOG_TIME_ON_PAGE, { slug, seconds, leave: true });
    };

    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      const el = target?.closest?.("a[href]");
      if (!el) return;
      const a = el as HTMLAnchorElement;
      const inArticle = articleRoot.contains(a);
      const inSticky = stickyHost?.contains(a) ?? false;
      if (!inArticle && !inSticky) return;
      const href = a.getAttribute("href") ?? "";
      const placement = a.dataset.blogCtaPlacement ?? "inline_link";
      if (
        href.includes("/book") ||
        href.includes("/booking") ||
        href.includes("paystack") ||
        a.dataset.blogTrackCta === "1"
      ) {
        const engagement = getCurrentTocEngagementSnapshot(slug);
        trackGrowthEvent(ANALYTICS_EVENTS.BLOG_CTA_CLICK, {
          slug,
          placement,
          href,
          ...(engagement ?? {}),
        });
      }
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("click", onClick);
    window.addEventListener("pagehide", flushTotal);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") flushTotal();
    });
    onScroll();

    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("click", onClick);
      window.removeEventListener("pagehide", flushTotal);
      window.clearInterval(interval);
      flushTotal();
      flushTocSectionEngagementForLeave();
    };
  }, [slug]);

  return null;
}
