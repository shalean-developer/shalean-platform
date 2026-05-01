import { randomUUID } from "node:crypto";
import type { BlogContentBlock, BlogContentJson, BlogFaqBlock } from "@/lib/blog/content-json";

const MIN_FAQ = 3;

export type EnhanceFaqContext = {
  location: string;
  city: string;
  service: string;
};

function templateFaqs(ctx: EnhanceFaqContext): { question: string; answer: string }[] {
  const { location, city, service } = ctx;
  const s = service.trim();
  const loc = location.trim();
  const c = city.trim();
  return [
    {
      question: `How much does ${s} cost in ${loc}?`,
      answer: `Pricing depends on home size, scope, and frequency. Start an online booking for ${loc}, ${c}—you will see a clear quote before you pay, with no surprise add-ons for the agreed checklist.`,
    },
    {
      question: `How soon can I book ${s.toLowerCase()} in ${loc}?`,
      answer: `Availability changes by day and area. Booking a few days ahead helps secure preferred slots in ${c}; same-week visits may still be possible depending on cleaner routes near ${loc}.`,
    },
    {
      question: `What is the difference between standard cleaning and ${s} here?`,
      answer: `${s} follows the checklist you select at booking—kitchens, bathrooms, floors, and dusting are prioritised based on that scope. If you are unsure, compare options in checkout notes for ${loc} so the team arrives with the right time and supplies.`,
    },
  ];
}

export function enhanceFaq(content_json: BlogContentJson, context: EnhanceFaqContext): BlogContentJson {
  const blocks = content_json.blocks.map((b) => ({ ...b })) as BlogContentBlock[];
  const faqIdx = blocks.findIndex((b) => b.type === "faq");
  const templates = templateFaqs(context);
  const existingQs = new Set<string>();

  if (faqIdx >= 0) {
    const faq = blocks[faqIdx] as BlogFaqBlock;
    const items = [...faq.items];
    for (const it of items) existingQs.add(it.question.trim().toLowerCase());
    let ti = 0;
    while (items.length < MIN_FAQ && ti < templates.length) {
      const t = templates[ti]!;
      ti += 1;
      if (existingQs.has(t.question.trim().toLowerCase())) continue;
      existingQs.add(t.question.trim().toLowerCase());
      items.push({ ...t });
    }
    blocks[faqIdx] = { ...faq, items };
  } else {
    blocks.push({
      id: randomUUID(),
      type: "faq",
      items: templates.slice(0, MIN_FAQ),
    });
  }

  return { ...content_json, blocks };
}
