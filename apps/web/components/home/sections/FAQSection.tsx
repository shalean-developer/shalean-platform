"use client";

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

const faqs = [
  {
    id: "pricing",
    q: "How much does cleaning cost in Cape Town?",
    a: "Cleaning prices depend on your service type, bedrooms, bathrooms, extras, and available time slot. The booking widget gives you an instant price before checkout.",
  },
  {
    id: "duration",
    q: "How long does cleaning take?",
    a: "Most standard cleans for a two-bedroom home take two to three hours. Deep and move cleans run longer because we tackle build-up, fixtures, and hard-to-reach areas. Your quote shows an estimated duration before you pay.",
  },
  {
    id: "availability",
    q: "Can I book same-day cleaning?",
    a: "Same-day cleaning may be available in Cape Town depending on cleaner availability and your selected service. Start a booking to see the soonest open slots.",
  },
  {
    id: "home",
    q: "Do I need to be home?",
    a: "You choose. Many customers leave a lockbox or remote access instructions. If you prefer to be present, pick a slot when you are available — the booking flow captures your preference.",
  },
  {
    id: "included",
    q: "What is included?",
    a: "Standard visits cover dusting reachable surfaces, vacuuming and mopping floors, sanitising bathrooms, and refreshing kitchens. Deep, move, and Airbnb packages extend that scope — add-ons like ovens or interior windows can be toggled before checkout.",
  },
  {
    id: "supplies",
    q: "Do cleaners bring supplies?",
    a: "Yes. Teams arrive with professional-grade products and equipment. If you need hypoallergenic options or want us to use your supplies, add a short note when you book.",
  },
] as const;

export function FAQSection() {
  return (
    <section id="faq" className="scroll-mt-28 border-b border-blue-100 bg-blue-50/40 py-16" aria-labelledby="faq-heading">
      <div className="mx-auto max-w-7xl px-4">
        <div className="mx-auto max-w-2xl text-center">
          <h2 id="faq-heading" className="text-3xl font-bold tracking-tight text-zinc-900">
            Frequently asked questions
          </h2>
          <p className="mt-3 text-gray-600">Straight answers so you know exactly what to expect.</p>
        </div>

        <div className="mx-auto mt-10 max-w-3xl rounded-2xl border border-blue-100 bg-white px-2 shadow-sm sm:px-6">
          <Accordion type="single" collapsible className="w-full">
            {faqs.map((item) => (
              <AccordionItem key={item.id} value={item.id}>
                <AccordionTrigger className="px-2 text-base sm:px-0">{item.q}</AccordionTrigger>
                <AccordionContent className="px-2 sm:px-0">{item.a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </div>
    </section>
  );
}
