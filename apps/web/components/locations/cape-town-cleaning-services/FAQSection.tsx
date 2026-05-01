"use client";

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

const faqs = [
  {
    q: "How much does cleaning cost in Cape Town?",
    a: "Cleaning prices in Cape Town depend on home size, bathrooms, and the service you pick (standard, deep, move-out, or Airbnb). Start an instant quote to see live pricing for your address—no payment until you confirm scope.",
  },
  {
    q: "Do cleaners bring their own supplies?",
    a: "Yes. Teams arrive with the products and equipment needed for the booked checklist. Add notes at checkout if you prefer specific products or have sensitivities.",
  },
  {
    q: "How long does cleaning take?",
    a: "Visit length depends on property size and service tier. Standard cleans are typically a half-day session; deep and move-out cleans take longer. Your quote estimates time based on the rooms you select.",
  },
  {
    q: "How do I book a cleaner?",
    a: "Choose a service, enter your Cape Town address and rooms, pick a date, then checkout online. You will see transparent pricing before you pay, and you can reschedule when plans change.",
  },
  {
    q: "Which Cape Town suburbs do you serve?",
    a: "We serve suburbs across the city—from Claremont and Rondebosch to Sea Point, the City Bowl, and the Northern Suburbs. Use suburb guides above or confirm coverage at checkout with your full address.",
  },
] as const;

export function FAQSection() {
  return (
    <section aria-labelledby="faq-heading" className="rounded-2xl border border-zinc-200/90 bg-white px-5 py-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/50 md:px-8 md:py-10">
      <h2 id="faq-heading" className="text-balance text-2xl font-semibold tracking-tight text-zinc-900 md:text-3xl dark:text-zinc-50">
        Frequently asked questions
      </h2>
      <Accordion type="single" collapsible className="mt-6 w-full">
        {faqs.map((item, i) => (
          <AccordionItem value={`item-${i}`} key={item.q}>
            <AccordionTrigger className="text-left text-base">{item.q}</AccordionTrigger>
            <AccordionContent className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">{item.a}</AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </section>
  );
}
