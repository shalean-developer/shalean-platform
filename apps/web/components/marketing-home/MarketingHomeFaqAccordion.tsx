"use client";

import { ChevronDown } from "lucide-react";
import { useState } from "react";
import type { HomeFaq } from "@/lib/home/data";
import { cn } from "@/lib/utils";

export function MarketingHomeFaqAccordion({ faqs }: { faqs: HomeFaq[] }) {
  const [openFaqId, setOpenFaqId] = useState<string | null>(null);

  return (
    <div className="overflow-hidden rounded-[var(--ui-radius-marketing)] border border-border bg-card shadow-[var(--ui-shadow-sm)]">
      {faqs.map((faq) => {
        const open = openFaqId === faq.id;
        return (
          <div key={faq.id} className="border-b border-border last:border-b-0">
            <button
              type="button"
              className="flex w-full items-center justify-between gap-[var(--ui-space-4)] px-[var(--ui-space-5)] py-[var(--ui-space-5)] text-left text-[length:var(--ui-text-body)] font-medium text-foreground transition hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:px-[var(--ui-space-6)] sm:py-[var(--ui-space-6)]"
              onClick={() => setOpenFaqId(open ? null : faq.id)}
              aria-expanded={open}
              suppressHydrationWarning
            >
              <span>{faq.question}</span>
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} aria-hidden />
              </span>
            </button>
            {open ? (
              <div className="border-t border-border bg-muted/30 px-[var(--ui-space-5)] py-[var(--ui-space-5)] text-[length:var(--ui-text-body)] leading-[var(--ui-leading-body)] text-muted-foreground sm:px-[var(--ui-space-6)]">
                {faq.answer}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
