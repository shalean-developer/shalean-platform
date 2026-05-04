import type { CapeTownLocationRow } from "@/lib/seo/capeTownLocations";
import { GOOGLE_BUSINESS_REVIEWS } from "@/lib/seo/googleReviews";
import { getLocationPricingFaqRange } from "@/lib/seo/location-pricing";

function propertyMixPhrase(row: CapeTownLocationRow): string {
  const t = new Set(row.propertyTypes);
  const parts: string[] = [];
  if (t.has("apartment")) parts.push("apartments");
  if (t.has("family_home")) parts.push("family homes");
  if (t.has("student_share")) parts.push("student shares");
  if (t.has("short_stay")) parts.push("Airbnb-style turnovers");
  if (t.has("luxury_home")) parts.push("larger or luxury layouts");
  if (t.has("townhouse")) parts.push("townhouses");
  if (parts.length === 0) return "local homes";
  if (parts.length === 1) return parts[0]!;
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")}, and ${parts[parts.length - 1]}`;
}

function coastalSupplyNote(name: string): string {
  return `Teams brief for Seaboard realities in ${name}: balcony grit, salt film on glass, and lifts—mention outdoor zones in your booking when you want them in scope.`;
}

function urbanAccessNote(name: string): string {
  return `Street parking, stairs, and intercoms vary block by block in ${name}; pin the entrance and remotes in your notes so teams arrive without delays.`;
}

/**
 * FAQs derived from structured hub fields (not a single global template).
 * Custom `seo.faqs` on a hub still override this entirely in the page component.
 */
export function buildDynamicLocationFaqs(row: CapeTownLocationRow): { q: string; a: string }[] {
  const { name, city, locationType } = row;
  const mix = propertyMixPhrase(row);
  const range = getLocationPricingFaqRange(row);

  const base: { q: string; a: string }[] = [
    {
      q: `What do “cleaning services in ${name}” include when I book through Shalean?`,
      a: `Cleaning services in ${name}, ${city} cover the scope you lock online—typically kitchens, bathrooms, living areas, and bedrooms based on your selections, with vetted crews and supplies dispatched for your address. Adjust rooms and add-ons before checkout so the quote matches the visit.`,
    },
    {
      q: `What do ${name} customers usually highlight after a Shalean visit?`,
      a: `Straightforward quotes, punctual arrivals, and thorough kitchens and bathrooms come up often alongside our ${GOOGLE_BUSINESS_REVIEWS.rating}★ Google rating (${GOOGLE_BUSINESS_REVIEWS.count} reviews)—themes across real bookings in ${city}.`,
    },
    {
      q: `How much does house cleaning cost in ${name}?`,
      a: `${range} ${name} skews toward ${mix}, which shifts time on kitchens, bathrooms, and floors.`,
    },
    {
      q: `Do cleaners bring supplies for ${name} bookings?`,
      a: `Yes—teams arrive with professional-grade products and equipment suited to typical ${city} homes. Flag allergies or preferred products in your notes so we brief the crew before arrival.`,
    },
    {
      q: `How soon can I book a cleaner in ${name}?`,
      a: `Often same-week, depending on demand in ${name}. Choose service and address online to see the soonest slots—your quote locks to the scope you selected.`,
    },
    {
      q: `Do you clean outside ${name} if I’m nearby?`,
      a: `Yes. Shalean covers suburbs across ${city}, including neighbourhoods next to ${name}. Browse nearby hub pages or enter your street at checkout—coverage and totals update automatically.`,
    },
  ];

  if (locationType === "coastal" || locationType === "blouberg") {
    base.push({
      q: `Anything specific for coastal homes in ${name}?`,
      a: coastalSupplyNote(name),
    });
  } else if (locationType === "urban") {
    base.push({
      q: `How should I prep access for ${name} flats or walk-ups?`,
      a: urbanAccessNote(name),
    });
  } else if (locationType === "estate") {
    base.push({
      q: `Are larger ${name} homes quoted differently?`,
      a: `Yes—plots, entertainment wings, and extra bathrooms need scoped time. Enter accurate room counts and add-ons online so ${name} visits match what your quote shows before payment.`,
    });
  } else {
    base.push({
      q: `What property types do you see most often in ${name}?`,
      a: `We regularly service ${mix} in ${name}. Your checkout selections tune the checklist so scope fits how your home actually lives—not a generic city-wide guess.`,
    });
  }

  base.push({
    q: `Which services can I book for ${name}?`,
    a: `Standard home cleaning, deep cleaning, move-out cleaning, Airbnb turnovers, office cleaning, and carpet care. Each service has a Cape Town-wide guide; your ${name} address finalises scope and pricing before checkout.`,
  });

  return base;
}
