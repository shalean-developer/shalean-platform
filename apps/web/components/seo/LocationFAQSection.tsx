"use client";

import { useRef } from "react";
import type { FaqPair } from "@/lib/seo/location-paa-faqs";
import { trackSeoFaqExpand } from "@/lib/analytics/track";

type Props = {
  locationName: string;
  items: FaqPair[];
  analytics?: {
    page_slug: string;
    suburb: string;
  };
};

/**
 * Expandable FAQ accordion + targets `#location-hub-faq` for internal links.
 * Tracks `seo_faq_expand` when a question opens (once per question per page load).
 */
export function LocationFAQSection({ locationName, items, analytics }: Props) {
  const expandedOnce = useRef(new Set<string>());

  return (
    <section id="location-hub-faq" className="scroll-mt-28 border-b border-zinc-100 py-16">
      <div className="mx-auto max-w-4xl px-4">
        <h2 className="text-2xl font-bold tracking-tight text-zinc-900">Frequently Asked Questions</h2>
        <p className="mt-2 text-sm text-zinc-600">Common questions about booking cleaning in {locationName}.</p>
        <div className="mt-8 space-y-3">
          {items.map((item) => (
            <details
              key={item.q}
              className="group rounded-2xl border border-zinc-200 bg-white shadow-sm open:border-emerald-200 open:shadow-md"
              onToggle={(e) => {
                const el = e.currentTarget;
                if (!el.open || !analytics) return;
                if (expandedOnce.current.has(item.q)) return;
                expandedOnce.current.add(item.q);
                trackSeoFaqExpand({
                  question: item.q,
                  surface: "location_hub",
                  page_slug: analytics.page_slug,
                  suburb: analytics.suburb,
                });
              }}
            >
              <summary className="cursor-pointer list-none px-5 py-4 text-base font-semibold text-zinc-900 outline-none marker:content-none [&::-webkit-details-marker]:hidden">
                <span className="flex items-center justify-between gap-3">
                  {item.q}
                  <span className="text-zinc-400 transition group-open:rotate-180" aria-hidden>
                    ▾
                  </span>
                </span>
              </summary>
              <div className="border-t border-zinc-100 px-5 pb-4 pt-2 text-sm leading-relaxed text-zinc-600">{item.a}</div>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
