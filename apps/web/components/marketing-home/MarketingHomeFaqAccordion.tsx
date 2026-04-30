"use client";

import { ChevronDown } from "lucide-react";
import { useState } from "react";
import type { HomeFaq } from "@/lib/home/data";
import { cn } from "@/lib/utils";

export function MarketingHomeFaqAccordion({ faqs }: { faqs: HomeFaq[] }) {
  const [openFaqId, setOpenFaqId] = useState<string | null>(null);

  return (
    <div className="mt-14 overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm sm:mt-16 lg:mt-20">
      {faqs.map((faq) => {
        const open = openFaqId === faq.id;
        return (
          <div key={faq.id} className="border-b border-slate-100 last:border-b-0">
            <button
              type="button"
              className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left text-sm font-semibold text-slate-900 transition hover:bg-slate-50/80 sm:px-6 sm:py-5 sm:text-base"
              onClick={() => setOpenFaqId(open ? null : faq.id)}
              aria-expanded={open}
              suppressHydrationWarning
            >
              {faq.question}
              <ChevronDown className={cn("h-5 w-5 shrink-0 text-slate-500 transition", open && "rotate-180")} />
            </button>
            {open ? (
              <div className="border-t border-slate-100 bg-slate-50/40 px-5 pb-5 pt-3 text-base leading-relaxed text-slate-600 sm:px-6">
                {faq.answer}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
