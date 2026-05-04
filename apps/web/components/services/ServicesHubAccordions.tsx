"use client";

import { useRef } from "react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { trackSeoFaqExpand } from "@/lib/analytics/track";

export type ServicesHubDetailAccordion = {
  id: string;
  title: string;
  bullets: readonly string[];
};

type Props = {
  serviceDetails: ServicesHubDetailAccordion[];
  faqs: readonly { q: string; a: string }[];
  faqAnalytics?: { page_slug: string; suburb: string };
};

export function ServicesHubAccordions({ serviceDetails, faqs, faqAnalytics }: Props) {
  const prevFaqOpen = useRef<string[]>([]);
  const faqTrackedOnce = useRef(new Set<string>());

  return (
    <div className="space-y-12">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-blue-950">What&apos;s included</h2>
        <p className="mt-2 max-w-2xl text-sm text-zinc-600">
          Expand a service for checklist highlights — full scope lives on each guide page.
        </p>
        <Accordion type="multiple" className="mt-6 divide-y divide-zinc-200 rounded-2xl border border-zinc-200 bg-white px-4">
          {serviceDetails.map((block) => (
            <AccordionItem key={block.id} value={block.id} className="border-0">
              <AccordionTrigger className="py-5 text-base font-semibold text-blue-950 hover:text-blue-950 hover:no-underline [&[data-state=open]>svg]:text-blue-500">
                {block.title}
              </AccordionTrigger>
              <AccordionContent className="pb-5">
                <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed text-zinc-600">
                  {block.bullets.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>

      <div>
        <h2 className="text-2xl font-bold tracking-tight text-blue-950">Frequently asked questions</h2>
        <p className="mt-2 max-w-2xl text-sm text-zinc-600">Quick answers — book online when you’re ready for an exact quote.</p>
        <Accordion
          type="multiple"
          className="mt-6 divide-y divide-zinc-200 rounded-2xl border border-zinc-200 bg-white px-4"
          onValueChange={(next) => {
            if (!faqAnalytics) return;
            const prev = prevFaqOpen.current;
            prevFaqOpen.current = next;
            const newlyOpen = next.filter((v) => !prev.includes(v));
            for (const val of newlyOpen) {
              const m = /^faq-(\d+)$/.exec(val);
              if (!m) continue;
              const idx = Number(m[1]);
              const row = faqs[idx];
              if (!row) continue;
              if (faqTrackedOnce.current.has(row.q)) continue;
              faqTrackedOnce.current.add(row.q);
              trackSeoFaqExpand({
                question: row.q,
                surface: "services_hub",
                page_slug: faqAnalytics.page_slug,
                suburb: faqAnalytics.suburb,
              });
            }
          }}
        >
          {faqs.map((item, i) => (
            <AccordionItem key={`faq-${i}`} value={`faq-${i}`} className="border-0">
              <AccordionTrigger className="py-5 text-base font-semibold text-blue-950 hover:text-blue-950 hover:no-underline [&[data-state=open]>svg]:text-blue-500">
                {item.q}
              </AccordionTrigger>
              <AccordionContent className="pb-5">
                <p className="text-sm leading-relaxed text-zinc-600">{item.a}</p>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </div>
  );
}
