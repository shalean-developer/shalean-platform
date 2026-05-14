/** FAQ rows for `/services/standard-cleaning-cape-town` — snippet-focused copy under pricing + merged JSON-LD. */
export type MoneyPageFaq = { q: string; a: string };

export const STANDARD_CLEANING_SNIPPET_FAQS: MoneyPageFaq[] = [
  {
    q: "Is standard cleaning the same as a deep clean?",
    a: "No. Standard visits maintain surfaces, floors, and wet rooms on a lighter checklist. Deep cleans add dwell on build-up, edges, and heavy kitchens or bathrooms—book deep when that reset is honest, then return to standard for rhythm.",
  },
  {
    q: "Do you offer same-day cleaning in Cape Town?",
    a: "Yes — same-day bookings are available when cleaner routing and slots allow. Pick your rooms online and you’ll see live availability before checkout.",
  },
  {
    q: "What's included in a standard cleaning service?",
    a: "Standard visits focus on dusting reachable surfaces, vacuuming and mopping floors where applicable, kitchen surfaces and the sink area, bathroom sanitisation and fixtures, and general tidying—exact scope follows the checklist tied to your quote.",
  },
  {
    q: "How long does a cleaning session take?",
    a: "Most homes take about 2–5 hours depending on size, bathrooms, extras, and how much build-up there is. You set bedrooms and bathrooms online so we can allocate realistic time before the team arrives.",
  },
  {
    q: "Which areas do you cover?",
    a: "We operate across Sea Point, Claremont, Observatory, Green Point, Gardens, and the wider Cape Town metro—each suburb hub explains typical access and layouts before you book.",
  },
];

function faqKey(q: string): string {
  return q.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Prefer earlier entries — used to merge snippet FAQs with CMS/service FAQs without duplicate Question names in JSON-LD. */
export function dedupeFaqsByQuestion(primary: MoneyPageFaq[], secondary: MoneyPageFaq[]): MoneyPageFaq[] {
  const seen = new Set<string>();
  const out: MoneyPageFaq[] = [];
  for (const faq of [...primary, ...secondary]) {
    const k = faqKey(faq.q);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(faq);
  }
  return out;
}
