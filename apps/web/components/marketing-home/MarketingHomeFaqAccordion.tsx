import { ChevronDown } from "lucide-react";
import type { HomeFaq } from "@/lib/home/data";

/** Native disclosure keeps every FAQ answer in the initial HTML without client JavaScript. */
export function MarketingHomeFaqAccordion({ faqs }: { faqs: HomeFaq[] }) {
  return (
    <div className="overflow-hidden rounded-[var(--ui-radius-marketing)] border border-border bg-card shadow-[var(--ui-shadow-sm)]">
      {faqs.map((faq) => (
        <details key={faq.id} className="group border-b border-border last:border-b-0">
          <summary className="flex w-full cursor-pointer list-none items-center justify-between gap-[var(--ui-space-4)] px-[var(--ui-space-5)] py-[var(--ui-space-5)] text-left text-[length:var(--ui-text-body)] font-medium text-foreground transition hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:px-[var(--ui-space-6)] sm:py-[var(--ui-space-6)] [&::-webkit-details-marker]:hidden">
            <span>{faq.question}</span>
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground" aria-hidden>
              <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
            </span>
          </summary>
          <div className="border-t border-border bg-muted/30 px-[var(--ui-space-5)] py-[var(--ui-space-5)] text-[length:var(--ui-text-body)] leading-[var(--ui-leading-body)] text-muted-foreground sm:px-[var(--ui-space-6)]">
            {faq.answer}
          </div>
        </details>
      ))}
    </div>
  );
}
