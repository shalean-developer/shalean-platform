"use client";

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { CLEANING_SERVICES_CAPE_TOWN_HUB_FAQS } from "@/lib/seo/cleaningServicesCapeTownHub";

export function FAQSection() {
  return (
    <section aria-labelledby="faq-heading" className="rounded-2xl border border-zinc-200/90 bg-white px-5 py-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/50 md:px-8 md:py-10">
      <h2 id="faq-heading" className="text-balance text-2xl font-semibold tracking-tight text-zinc-900 md:text-3xl dark:text-zinc-50">
        Frequently asked questions
      </h2>
      <Accordion type="single" collapsible className="mt-6 w-full">
        {CLEANING_SERVICES_CAPE_TOWN_HUB_FAQS.map((item, i) => (
          <AccordionItem value={`item-${i}`} key={item.idSlug}>
            <AccordionTrigger className="text-left text-base">{item.question}</AccordionTrigger>
            <AccordionContent className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">{item.answer}</AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </section>
  );
}
