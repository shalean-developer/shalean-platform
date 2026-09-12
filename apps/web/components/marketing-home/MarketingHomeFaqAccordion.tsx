import { ChevronDown } from "lucide-react";
import type { HomeFaq } from "@/lib/home/data";

/** Native disclosure keeps every FAQ answer in the initial HTML without client JavaScript. */
export function MarketingHomeFaqAccordion({ faqs }: { faqs: HomeFaq[] }) {
  return (
    <div className="overflow-hidden rounded-lg border border-[#DCE7FF] bg-card shadow-[var(--ui-shadow-sm)]">
      {faqs.map((faq) => (
        <details key={faq.id} className="group border-b border-[#DCE7FF] last:border-b-0">
          <summary className="flex min-h-16 w-full cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-left text-base font-medium text-[#00164E] transition hover:bg-[#F5F7FB] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#0051FF] sm:px-6 [&::-webkit-details-marker]:hidden">
            <span>{faq.question}</span>
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[#EEF3FF] text-[#0033A1]" aria-hidden>
              <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
            </span>
          </summary>
          <div className="border-t border-[#DCE7FF] bg-[#F5F7FB] px-5 py-5 text-base leading-7 text-slate-600 sm:px-6">
            {faq.answer}
          </div>
        </details>
      ))}
    </div>
  );
}
