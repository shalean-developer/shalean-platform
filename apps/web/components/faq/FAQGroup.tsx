"use client";

import { Accordion } from "@/components/ui/accordion";
import { FAQItem } from "@/components/faq/FAQItem";
import type { FaqCategoryGroup } from "@/lib/faq/faq-page-types";

type Props = {
  group: FaqCategoryGroup;
};

export function FAQGroup({ group }: Props) {
  if (group.items.length === 0) return null;

  return (
    <section className="scroll-mt-28" aria-labelledby={`faq-cat-${group.id}`}>
      <div className="border-b border-zinc-200 pb-3">
        <h2 id={`faq-cat-${group.id}`} className="text-xl font-bold tracking-tight text-zinc-900 sm:text-2xl">
          {group.title}
        </h2>
        {group.description ? <p className="mt-2 text-sm text-zinc-600 sm:text-base">{group.description}</p> : null}
      </div>
      <Accordion type="multiple" className="mt-4 divide-y divide-zinc-200 rounded-2xl border border-zinc-200 bg-white px-1 sm:px-2">
        {group.items.map((item) => (
          <FAQItem key={item.id} item={item} />
        ))}
      </Accordion>
    </section>
  );
}
