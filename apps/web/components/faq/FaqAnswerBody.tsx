import type { FaqStructuredItem } from "@/lib/faq/faq-page-types";
import { FaqRichText } from "@/components/faq/FaqRichText";
import { InlineCTA } from "@/components/faq/InlineCTA";
import { cn } from "@/lib/utils";

type Props = {
  item: FaqStructuredItem;
  ctaSourceSuffix: string;
  className?: string;
};

/** Lead sentence + expansion + optional bullets + inline booking CTA. */
export function FaqAnswerBody({ item, ctaSourceSuffix, className }: Props) {
  return (
    <div className={cn("space-y-3 text-sm leading-relaxed text-zinc-700 sm:text-base", className)}>
      <p className="font-semibold text-zinc-900">{item.lead}</p>
      {(item.paragraphs ?? []).map((p, i) => (
        <p key={i}>
          <FaqRichText text={p} />
        </p>
      ))}
      {item.bullets && item.bullets.length > 0 ? (
        <ul className="list-disc space-y-2 pl-5 text-zinc-700">
          {item.bullets.map((b, i) => (
            <li key={i}>
              <FaqRichText text={b} />
            </li>
          ))}
        </ul>
      ) : null}
      {item.showInlineCta ? <InlineCTA source={`faq_inline_price_${ctaSourceSuffix}`} className="pt-2" /> : null}
    </div>
  );
}
