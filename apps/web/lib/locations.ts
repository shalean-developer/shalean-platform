export type ServiceLocation = {
  slug: string;
  name: string;
  citySlug: "cape-town" | "johannesburg";
  cityName: string;
  intro: string;
  propertyFocus: string;
  localContext: string;
  review: {
    author: string;
    body: string;
  };
  imageAlt: string;
  imageSrc?: string;
  nearby: string[];
};

export const LOCATIONS: ServiceLocation[] = [
  {
    slug: "cape-town",
    name: "Cape Town",
    citySlug: "cape-town",
    cityName: "Cape Town",
    intro: "Professional home cleaning services in Cape Town",
    propertyFocus: "city apartments, family homes, short-stay rentals, and busy professional households",
    localContext: "Cape Town customers often need flexible scheduling around workdays, guest arrivals, school runs, and weekend plans.",
    review: { author: "Sarah M", body: "Excellent cleaning service in Cape Town. The booking was quick and the cleaner left our kitchen spotless." },
    imageAlt: "Home cleaning service in Cape Town",
    nearby: ["sea-point", "claremont", "gardens", "table-view"],
  },
  {
    slug: "sea-point",
    name: "Sea Point",
    citySlug: "cape-town",
    cityName: "Cape Town",
    intro: "Apartment, Airbnb, and home cleaning services in Sea Point",
    propertyFocus: "high-rise apartments, beachfront homes, lock-up-and-go flats, and Airbnb turnovers",
    localContext: "Sea Point homes often need fast, tidy cleans between guest check-outs, work commutes, and evening plans along the Atlantic Seaboard.",
    review: { author: "Megan R", body: "Excellent cleaning service in Sea Point. Our apartment was guest-ready before the next check-in." },
    imageAlt: "Home cleaning in a Sea Point apartment",
    nearby: ["green-point", "camps-bay", "gardens", "cape-town"],
  },
  {
    slug: "claremont",
    name: "Claremont",
    citySlug: "cape-town",
    cityName: "Cape Town",
    intro: "Trusted home cleaning services in Claremont",
    propertyFocus: "family homes, student apartments, townhouses, and regular maintenance cleans",
    localContext: "Claremont households often balance school schedules, office commutes, and weekend hosting, so dependable recurring cleaning matters.",
    review: { author: "Lauren P", body: "The Claremont cleaner arrived on time and handled our deep clean with real attention to detail." },
    imageAlt: "Kitchen cleaning in a Claremont home",
    nearby: ["gardens", "cape-town", "bellville", "constantia"],
  },
  {
    slug: "gardens",
    name: "Gardens",
    citySlug: "cape-town",
    cityName: "Cape Town",
    intro: "Reliable apartment and home cleaning services in Gardens",
    propertyFocus: "City Bowl apartments, compact homes, rental properties, and regular apartment cleaning",
    localContext: "Gardens residents often need efficient cleaning for smaller homes where bathrooms, floors, and kitchens need frequent attention.",
    review: { author: "Jason D", body: "Great cleaning service in Gardens. The team was efficient, friendly, and easy to book online." },
    imageAlt: "Apartment cleaning service in Gardens Cape Town",
    nearby: ["cape-town", "sea-point", "green-point", "woodstock"],
  },
  {
    slug: "table-view",
    name: "Table View",
    citySlug: "cape-town",
    cityName: "Cape Town",
    intro: "Family home and Airbnb cleaning services in Table View",
    propertyFocus: "family houses, coastal apartments, pet-friendly homes, and Airbnb properties",
    localContext: "Table View homes often deal with beach sand, open-plan living areas, and guest turnover timing, making reliable cleaning especially useful.",
    review: { author: "Nadia K", body: "Our Table View home felt fresh again. The floors, bathrooms, and kitchen were all done properly." },
    imageAlt: "Home cleaning in Table View family home",
    nearby: ["cape-town", "durbanville", "bellville", "sea-point"],
  },
  {
    slug: "durbanville",
    name: "Durbanville",
    citySlug: "cape-town",
    cityName: "Cape Town",
    intro: "Professional house cleaning services in Durbanville",
    propertyFocus: "larger family homes, townhouses, kitchens, bathrooms, and scheduled weekly cleaning",
    localContext: "Durbanville families often need consistent home cleaning that works around school runs, remote work, and weekend entertaining.",
    review: { author: "Chantel V", body: "Reliable cleaning in Durbanville. Booking was simple and the cleaner paid attention to all the high-touch areas." },
    imageAlt: "House cleaning service in Durbanville",
    nearby: ["bellville", "table-view", "cape-town", "claremont"],
  },
  {
    slug: "bellville",
    name: "Bellville",
    citySlug: "cape-town",
    cityName: "Cape Town",
    intro: "Affordable home cleaning services in Bellville",
    propertyFocus: "apartments, family houses, move-out cleans, and recurring maintenance cleaning",
    localContext: "Bellville customers often need practical, transparent cleaning that covers busy households, rentals, and end-of-lease handovers.",
    review: { author: "Ayesha F", body: "Our Bellville move-out clean was handled professionally and the price was clear before checkout." },
    imageAlt: "Move-out cleaning in Bellville",
    nearby: ["durbanville", "table-view", "claremont", "cape-town"],
  },
  {
    slug: "green-point",
    name: "Green Point",
    citySlug: "cape-town",
    cityName: "Cape Town",
    intro: "Airbnb turnover and apartment cleaning services in Green Point",
    propertyFocus: "Airbnb apartments, guest-ready bathrooms, compact kitchens, and short-stay turnovers",
    localContext: "Green Point hosts often need quick, consistent cleaning between bookings near the stadium, waterfront, and Atlantic Seaboard.",
    review: { author: "Andre S", body: "Perfect for our Green Point Airbnb. The cleaner was punctual and the place looked ready for photos." },
    imageAlt: "Airbnb cleaning in Green Point apartment",
    nearby: ["sea-point", "gardens", "cape-town", "camps-bay"],
  },
  {
    slug: "woodstock",
    name: "Woodstock",
    citySlug: "cape-town",
    cityName: "Cape Town",
    intro: "Home and apartment cleaning services in Woodstock",
    propertyFocus: "loft apartments, creative studios, older homes, rentals, and regular home cleaning",
    localContext: "Woodstock spaces can range from compact apartments to character homes, so Shalean adapts the checklist to each property.",
    review: { author: "Thabo N", body: "The Woodstock cleaning was easy to arrange and our apartment felt properly reset afterward." },
    imageAlt: "Apartment cleaning in Woodstock",
    nearby: ["observatory", "gardens", "cape-town", "claremont"],
  },
  {
    slug: "camps-bay",
    name: "Camps Bay",
    citySlug: "cape-town",
    cityName: "Cape Town",
    intro: "Premium Airbnb and home cleaning services in Camps Bay",
    propertyFocus: "luxury homes, villas, holiday rentals, guest bathrooms, and high-standard Airbnb turnovers",
    localContext: "Camps Bay properties often need polished presentation before guest arrivals, family stays, or weekend entertaining.",
    review: { author: "Bianca L", body: "Our Camps Bay rental was cleaned beautifully before guests arrived. Very professional service." },
    imageAlt: "Premium home cleaning in Camps Bay",
    nearby: ["sea-point", "green-point", "cape-town", "gardens"],
  },
  {
    slug: "observatory",
    name: "Observatory",
    citySlug: "cape-town",
    cityName: "Cape Town",
    intro: "Trusted cleaning services for homes and apartments in Observatory",
    propertyFocus: "student rentals, apartments, shared homes, kitchens, bathrooms, and move-in cleaning",
    localContext: "Observatory customers often need flexible cleans for shared homes, rental changes, and busy weekday routines.",
    review: { author: "Kelly J", body: "Great Observatory cleaning service. The shared kitchen and bathroom were spotless afterward." },
    imageAlt: "Shared home cleaning in Observatory",
    nearby: ["woodstock", "claremont", "gardens", "cape-town"],
  },
  {
    slug: "constantia",
    name: "Constantia",
    citySlug: "cape-town",
    cityName: "Cape Town",
    intro: "Deep cleaning and recurring home cleaning services in Constantia",
    propertyFocus: "larger homes, family kitchens, bathrooms, entertainment areas, and recurring deep cleaning",
    localContext: "Constantia households often need detail-oriented cleaning for spacious homes, guest areas, and regular family routines.",
    review: { author: "Richard B", body: "Excellent deep cleaning in Constantia. The team handled a large house without rushing." },
    imageAlt: "Deep cleaning service in Constantia home",
    nearby: ["claremont", "cape-town", "gardens", "durbanville"],
  },
  {
    slug: "sandton",
    name: "Sandton",
    citySlug: "johannesburg",
    cityName: "Johannesburg",
    intro: "Professional home cleaning services in Sandton",
    propertyFocus: "apartments, executive homes, and recurring cleaning for busy professionals",
    localContext: "Sandton customers often need reliable cleaning that fits around work schedules and apartment access requirements.",
    review: { author: "Nomsa T", body: "Reliable Sandton cleaning service with a simple booking process." },
    imageAlt: "Home cleaning service in Sandton",
    nearby: ["rosebank", "randburg"],
  },
  {
    slug: "rosebank",
    name: "Rosebank",
    citySlug: "johannesburg",
    cityName: "Johannesburg",
    intro: "Trusted apartment and home cleaning services in Rosebank",
    propertyFocus: "apartments, townhouses, rentals, and recurring cleaning",
    localContext: "Rosebank homes often need convenient cleaning around commuting, shopping, and apartment living.",
    review: { author: "Dylan M", body: "Our Rosebank apartment was cleaned quickly and professionally." },
    imageAlt: "Apartment cleaning in Rosebank",
    nearby: ["sandton", "randburg"],
  },
  {
    slug: "randburg",
    name: "Randburg",
    citySlug: "johannesburg",
    cityName: "Johannesburg",
    intro: "Reliable house cleaning services in Randburg",
    propertyFocus: "family homes, townhouses, rental properties, and move-out cleaning",
    localContext: "Randburg customers often need flexible cleaning for larger homes, family schedules, and rental handovers.",
    review: { author: "Priya K", body: "Good Randburg house cleaning with clear pricing before checkout." },
    imageAlt: "House cleaning in Randburg",
    nearby: ["sandton", "rosebank"],
  },
];

export function getLocation(slug: string): ServiceLocation | null {
  return LOCATIONS.find((location) => location.slug === slug) ?? null;
}

export function getLocationsByCity(citySlug: ServiceLocation["citySlug"]): ServiceLocation[] {
  return LOCATIONS.filter((location) => location.citySlug === citySlug);
}
