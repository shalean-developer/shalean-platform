"use client";

import { AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import type { FaqStructuredItem } from "@/lib/faq/faq-page-types";
import { FaqAnswerBody } from "@/components/faq/FaqAnswerBody";
import { cn } from "@/lib/utils";

type Props = {
  item: FaqStructuredItem;
};

/** Single accordion FAQ row — open state styled for emphasis. */
export function FAQItem({ item }: Props) {
  return (
    <AccordionItem value={item.id} className="border-0 px-3 sm:px-4">
      <AccordionTrigger
        className={cn(
          "py-5 text-left text-base font-semibold text-zinc-900 hover:bg-zinc-50/90 hover:no-underline",
          "data-[state=open]:border-l-4 data-[state=open]:border-emerald-600 data-[state=open]:bg-emerald-50/70 data-[state=open]:pl-3 sm:data-[state=open]:pl-4",
          "[&[data-state=open]>svg]:rotate-180 [&[data-state=open]>svg]:text-emerald-700 [&_svg]:text-emerald-600",
        )}
      >
        {item.question}
      </AccordionTrigger>
      <AccordionContent className="border-t border-zinc-100 bg-zinc-50/40 px-0 pb-5 pt-4 text-zinc-700">
        <FaqAnswerBody item={item} ctaSourceSuffix={item.id} />
      </AccordionContent>
    </AccordionItem>
  );
}
