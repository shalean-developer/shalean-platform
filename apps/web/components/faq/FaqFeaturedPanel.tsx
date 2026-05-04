import type { FaqStructuredItem } from "@/lib/faq/faq-page-types";
import { FaqAnswerBody } from "@/components/faq/FaqAnswerBody";

type Props = {
  item: FaqStructuredItem;
};

/** Featured FAQ — always expanded, snippet-first layout. */
export function FaqFeaturedPanel({ item }: Props) {
  return (
    <article className="rounded-2xl border border-emerald-200/80 bg-gradient-to-b from-emerald-50/50 to-white p-5 shadow-sm sm:p-6">
      <h3 className="text-lg font-bold tracking-tight text-zinc-900 sm:text-xl">{item.question}</h3>
      <div className="mt-4">
        <FaqAnswerBody item={item} ctaSourceSuffix={`featured_${item.id}`} />
      </div>
    </article>
  );
}
