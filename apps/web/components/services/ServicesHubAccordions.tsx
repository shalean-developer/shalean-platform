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

const accordionShellClass =
  "mt-[var(--ui-space-6)] divide-y divide-border overflow-hidden rounded-[var(--ui-radius-marketing)] border border-[#DBEAFE] bg-card px-[var(--ui-space-5)] shadow-[var(--ui-shadow-sm)]";
const triggerClass =
  "py-[var(--ui-space-5)] text-left text-[length:var(--ui-text-body)] font-medium text-foreground hover:text-foreground hover:no-underline [&[data-state=open]>svg]:text-primary";

export function ServicesHubAccordions({ serviceDetails, faqs, faqAnalytics }: Props) {
  const prevFaqOpen = useRef<string[]>([]);
  const faqTrackedOnce = useRef(new Set<string>());

  return (
    <div className="grid gap-[var(--ui-space-12)] lg:grid-cols-2 lg:gap-[var(--ui-space-10)]">
      <div>
        <p className="text-[length:var(--ui-text-caption)] font-semibold uppercase tracking-[0.14em] text-primary">Service scope</p>
        <h2 className="mt-[var(--ui-space-3)] text-[length:var(--ui-text-section-title)] font-semibold leading-[var(--ui-leading-tight)] tracking-tight text-foreground">
          What&apos;s included
        </h2>
        <p className="mt-[var(--ui-space-3)] max-w-xl text-[length:var(--ui-text-small)] leading-[var(--ui-leading-body)] text-muted-foreground">
          Expand a service for checklist highlights. Full scope stays on each dedicated service guide.
        </p>
        <Accordion type="multiple" className={accordionShellClass}>
          {serviceDetails.map((block) => (
            <AccordionItem key={block.id} value={block.id} className="border-0">
              <AccordionTrigger className={triggerClass}>{block.title}</AccordionTrigger>
              <AccordionContent className="pb-[var(--ui-space-5)]">
                <ul className="list-disc space-y-[var(--ui-space-2)] pl-5 text-[length:var(--ui-text-small)] leading-[var(--ui-leading-body)] text-muted-foreground">
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
        <p className="text-[length:var(--ui-text-caption)] font-semibold uppercase tracking-[0.14em] text-primary">Help</p>
        <h2 className="mt-[var(--ui-space-3)] text-[length:var(--ui-text-section-title)] font-semibold leading-[var(--ui-leading-tight)] tracking-tight text-foreground">
          Frequently asked questions
        </h2>
        <p className="mt-[var(--ui-space-3)] max-w-xl text-[length:var(--ui-text-small)] leading-[var(--ui-leading-body)] text-muted-foreground">
          Quick answers before you choose a service or continue to your exact online quote.
        </p>
        <Accordion
          type="multiple"
          className={accordionShellClass}
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
              <AccordionTrigger className={triggerClass}>{item.q}</AccordionTrigger>
              <AccordionContent className="pb-[var(--ui-space-5)]">
                <p className="text-[length:var(--ui-text-small)] leading-[var(--ui-leading-body)] text-muted-foreground">{item.a}</p>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </div>
  );
}
