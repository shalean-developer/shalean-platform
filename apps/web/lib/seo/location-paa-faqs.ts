import type { CapeTownLocationRow } from "@/lib/seo/capeTownLocations";
import { directAnswerHowMuchDoesCleaningCost } from "@/lib/seo/location-featured-snippet-copy";
import { getLocationMetaPriceHint } from "@/lib/seo/location-pricing";

export type FaqPair = { q: string; a: string };

function stemVariant(slug: string): 0 | 1 | 2 {
  let h = 0;
  for (let i = 0; i < slug.length; i++) h = (h * 33 + slug.charCodeAt(i)) | 0;
  const v = Math.abs(h) % 3;
  return v as 0 | 1 | 2;
}

/** People-Also-Ask + long-tail commercial FAQs — merged into hub FAQ schema + accordion. */
export function buildPeopleAlsoAskFaqs(location: CapeTownLocationRow): FaqPair[] {
  const { name, city, slug } = location;
  const priceLead = directAnswerHowMuchDoesCleaningCost(location).split(". ")[0] ?? "";
  const hint = getLocationMetaPriceHint(location);
  const tone = stemVariant(slug);

  const suppliesLead =
    tone === 0
      ? `Supply and equipment responsibility in ${name} depends on the service: Deep and Move In / Out Cleaning include Shalean-provided cleaning supplies, while Regular home cleaning and Airbnb Cleaning use customer-provided products and equipment unless a separate supplies option or charge is selected or agreed.`
      : tone === 1
        ? `For Regular home cleaning and Airbnb Cleaning in ${name}, customers provide the usual products and equipment unless a separate supplies option or charge is selected or agreed. Deep and Move In / Out Cleaning include Shalean-provided cleaning supplies.`
        : `Check the booked service before preparing supplies in ${name}: Deep and Move In / Out Cleaning include Shalean-provided cleaning supplies; Regular home cleaning and Airbnb Cleaning use customer-provided products and equipment unless a separate supplies arrangement is selected or agreed.`;

  const sameDayLead =
    tone === 0
      ? `Same-day and next-day slots sometimes open for ${name} when routing allows—check live availability after you enter your ${city} address.`
      : tone === 1
        ? `You may see same-day ${name} openings mid-week more often than peak Saturdays; the booking flow shows only times that fit your scope.`
        : `Same-day cleaning in ${name} depends on crew proximity and job length—short standard scopes place easier than full deep resets on tight clocks.`;

  return [
    {
      q: `How much does a cleaner cost in ${name}?`,
      a: `${priceLead}. Your locked total reflects bedrooms, bathrooms, tier, and add-ons online before payment. Planning bands: ${hint}.`,
    },
    {
      q: `Is cleaning priced per hour or per job in ${name}?`,
      a: `Shalean quotes per job for ${name} addresses—you select rooms, bathrooms, intensity, and extras, then see one itemised total before paying. Hourly maths hides bathroom load and add-ons; job pricing keeps scope tied to what crews actually complete.`,
    },
    {
      q: `Do cleaners bring their own supplies in ${name}?`,
      a: `${suppliesLead} Flag anything unusual so teams brief correctly before arrival.`,
    },
    {
      q: `How long does a deep clean take in ${name}?`,
      a: `Deep cleans in ${name} usually exceed standard visits—often roughly half a day for compact apartments and longer for multi-bathroom homes or heavy kitchens. Note ovens, fridges, and balconies so crew hours stay realistic.`,
    },
    {
      q: `Can I book same-day cleaning in ${name}?`,
      a: `${sameDayLead}`,
    },
    {
      q: `What is the cancellation policy for ${name} bookings?`,
      a: `Cancellation windows follow the policy shown at checkout for your slot—generally earlier moves free routing for other ${city} customers. Reschedule in-app when possible so scope and pricing stay matched to the new time.`,
    },
    {
      q: `How are cleaners vetted for ${name} visits?`,
      a: `Teams are reference-checked and operate with coverage suited to professional home visits—not informal cash-only operators. Shalean routes structured support if something verifiably misses the agreed checklist you confirmed online.`,
    },
  ];
}

function normalizeKey(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Dedupe by question stem — PAA items win on overlap with dynamic CMS FAQs. */
export function mergeLocationFaqs(paa: FaqPair[], secondary: FaqPair[]): FaqPair[] {
  const keys = new Set(paa.map((x) => normalizeKey(x.q)));
  const out = [...paa];
  for (const item of secondary) {
    if (keys.has(normalizeKey(item.q))) continue;
    keys.add(normalizeKey(item.q));
    out.push(item);
  }
  return out;
}
