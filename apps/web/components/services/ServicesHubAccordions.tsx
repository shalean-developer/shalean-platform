"use client";

import { useRef } from "react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { trackSeoFaqExpand } from "@/lib/analytics/track";

export type ServicesHubDetailAccordion = {
  id: string;
  title: string;
  bullets: readonly string[];
};

type ServiceDetailsProps = {
  serviceDetails: ServicesHubDetailAccordion[];
};

type FaqProps = {
  faqs: readonly { q: string; a: string }[];
  faqAnalytics?: { page_slug: string; suburb: string };
};

type Props = ServiceDetailsProps & FaqProps;

const accordionClass = "border-t border-border";
const triggerClass =
  "py-[var(--ui-space-6)] text-left text-[length:var(--ui-text-card-title)] font-medium leading-[var(--ui-leading-tight)] text-foreground hover:text-primary hover:no-underline [&[data-state=open]>svg]:text-primary";

export function ServicesHubServiceDetails({ serviceDetails }: ServiceDetailsProps) {
  return (
    <Accordion type="multiple" className={accordionClass}>
      {serviceDetails.map((block) => (
        <AccordionItem key={block.id} value={block.id} className="border-b border-border">
          <AccordionTrigger className={triggerClass}>{block.title}</AccordionTrigger>
          <AccordionContent className="pb-[var(--ui-space-6)]">
            <ul className="list-disc space-y-[var(--ui-space-2)] pl-[var(--ui-space-5)] text-[length:var(--ui-text-small)] leading-[var(--ui-leading-body)] text-muted-foreground">
              {block.bullets.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}

export function ServicesHubFaqs({ faqs, faqAnalytics }: FaqProps) {
  const prevFaqOpen = useRef<string[]>([]);
  const faqTrackedOnce = useRef(new Set<string>());

  return (
    <Accordion
      type="multiple"
      className={accordionClass}
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
          if (!row || faqTrackedOnce.current.has(row.q)) continue;
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
        <AccordionItem key={`faq-${i}`} value={`faq-${i}`} className="border-b border-border">
          <AccordionTrigger className={triggerClass}>{item.q}</AccordionTrigger>
          <AccordionContent className="pb-[var(--ui-space-6)]">
            <p className="text-[length:var(--ui-text-small)] leading-[var(--ui-leading-body)] text-muted-foreground">{item.a}</p>
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}

/** Compatibility composition for any legacy call sites; new layouts should place the two regions independently. */
export function ServicesHubAccordions({ serviceDetails, faqs, faqAnalytics }: Props) {
  return (
    <div className="grid gap-[var(--ui-space-12)] lg:grid-cols-2 lg:gap-[var(--ui-space-16)]">
      <section aria-labelledby="services-included-heading">
        <p className="text-[length:var(--ui-text-small)] font-semibold uppercase tracking-[0.14em] text-primary">Service scope</p>
        <h2
          id="services-included-heading"
          className="mt-[var(--ui-space-3)] text-[length:var(--ui-text-page-title)] font-semibold leading-[var(--ui-leading-tight)] tracking-[-0.03em] text-foreground"
        >
          What&apos;s included
        </h2>
        <p className="mt-[var(--ui-space-4)] max-w-xl text-[length:var(--ui-text-body)] leading-[var(--ui-leading-body)] text-muted-foreground">
          Open a service for checklist highlights. The full service page carries the complete scope and exclusions.
        </p>
        <div className="mt-[var(--ui-space-8)]">
          <ServicesHubServiceDetails serviceDetails={serviceDetails} />
        </div>
      </section>

      <section aria-labelledby="services-faq-heading">
        <p className="text-[length:var(--ui-text-small)] font-semibold uppercase tracking-[0.14em] text-primary">FAQ</p>
        <h2
          id="services-faq-heading"
          className="mt-[var(--ui-space-3)] text-[length:var(--ui-text-page-title)] font-semibold leading-[var(--ui-leading-tight)] tracking-[-0.03em] text-foreground"
        >
          Questions before you book?
        </h2>
        <p className="mt-[var(--ui-space-4)] max-w-xl text-[length:var(--ui-text-body)] leading-[var(--ui-leading-body)] text-muted-foreground">
          Quick answers about choosing a service, pricing and booking in Cape Town.
        </p>
        <div className="mt-[var(--ui-space-8)]">
          <ServicesHubFaqs faqs={faqs} faqAnalytics={faqAnalytics} />
        </div>
      </section>
    </div>
  );
}
