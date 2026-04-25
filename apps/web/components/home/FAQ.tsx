import type { HomeFaq } from "@/lib/home/data";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

type FAQProps = {
  faqs: HomeFaq[];
};

export function FAQ({ faqs }: FAQProps) {
  if (faqs.length === 0) return null;

  return (
    <section id="faq" className="bg-blue-50/60 py-16 sm:py-20">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
        <div className="max-w-2xl">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-700">FAQ</p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-zinc-950 sm:text-4xl">Home cleaning questions</h2>
        </div>
        <Accordion type="single" collapsible className="mt-8 rounded-2xl border border-blue-100 bg-white px-5">
          {faqs.map((faq) => (
            <AccordionItem key={faq.id} value={faq.id}>
              <AccordionTrigger>{faq.question}</AccordionTrigger>
              <AccordionContent>{faq.answer}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}
