import type { HomeWidgetServiceKey } from "@/lib/pricing/calculatePrice";

export type ServicePageConfig = {
  slug: string;
  name: string;
  pricingKey: HomeWidgetServiceKey;
  h1: string;
  description: string;
  intro: string;
  contentSections: {
    heading: string;
    paragraphs: string[];
  }[];
  includes: string[];
  whoFor: string;
  comparisonCopy: string;
  urgencyCopy: string;
  pricingCopy: string;
  imageAlt: string;
  imageSrc?: string;
  faqs: {
    q: string;
    a: string;
  }[];
  reviews: {
    author: string;
    rating: number;
    body: string;
  }[];
};

export const SERVICES: ServicePageConfig[] = [
  {
    slug: "standard-cleaning",
    name: "Standard Cleaning",
    pricingKey: "standard",
    h1: "Standard Home Cleaning Services in Cape Town",
    description:
      "Book standard home cleaning services in Cape Town for regular upkeep, tidy kitchens, fresh bathrooms, and clean floors.",
    intro:
      "Standard cleaning is ideal for homes that need reliable weekly, bi-weekly, or once-off maintenance. Shalean cleaners focus on the high-use areas that make your home feel calm again: kitchens, bathrooms, bedrooms, living areas, and floors.",
    contentSections: [
      {
        heading: "Professional Standard Cleaning Services in Cape Town",
        paragraphs: [
          "Standard home cleaning in Cape Town is built for everyday upkeep. It is the service customers choose when the home is not heavily soiled, but still needs a reliable clean across kitchens, bathrooms, floors, bedrooms, and living spaces.",
          "Shalean helps busy households keep a consistent baseline without spending weekends catching up on chores. The service works well for apartments, family homes, lock-up-and-go properties, and recurring bookings where the goal is a fresh, tidy home.",
        ],
      },
      {
        heading: "Regular Home Cleaning for Busy Households",
        paragraphs: [
          "A standard clean is more focused than a quick tidy, but lighter than a deep clean. Cleaners handle the visible surfaces and high-use areas that most affect how your home feels day to day.",
          "If you need a more detailed reset, add extras or choose deep cleaning. If you need predictable upkeep, standard cleaning gives you the best balance of speed, quality, and price.",
        ],
      },
    ],
    includes: ["Dusting reachable surfaces", "Vacuuming and mopping floors", "Kitchen wipe-down", "Bathroom sanitisation", "Bedroom and living area refresh"],
    whoFor:
      "This service is best for busy households, apartment residents, professionals, and families who want dependable upkeep without booking a full deep clean.",
    comparisonCopy: "More practical than a quick tidy and lighter than deep cleaning, standard cleaning is ideal for regular home maintenance.",
    urgencyCopy: "Same-day standard cleaning slots may be available in Cape Town depending on cleaner availability.",
    pricingCopy:
      "Standard cleaning prices depend on home size, bedrooms, bathrooms, extras, and your selected time slot. Your exact total appears before checkout.",
    imageAlt: "Standard home cleaning service in Cape Town apartment",
    faqs: [
      {
        q: "What is included in standard home cleaning?",
        a: "Standard cleaning includes reachable dusting, floors, kitchen wipe-downs, bathroom sanitisation, and general room refreshes.",
      },
      {
        q: "How much is standard cleaning in Cape Town?",
        a: "Standard cleaning prices in Cape Town depend on property size, rooms, bathrooms, extras, and available time slots. Your exact quote is shown before checkout.",
      },
      {
        q: "Can I book recurring standard cleaning?",
        a: "Yes. Standard cleaning works well for weekly, bi-weekly, and monthly home maintenance.",
      },
      {
        q: "Do cleaners bring supplies?",
        a: "Yes. Cleaners bring professional supplies, or you can request that they use your preferred products.",
      },
    ],
    reviews: [
      { author: "Nadia K", rating: 5, body: "Our standard clean was easy to book and the apartment felt fresh again." },
      { author: "James T", rating: 5, body: "Reliable weekly cleaning with clear pricing and friendly cleaners." },
      { author: "Ayesha M", rating: 5, body: "Great service for keeping our home tidy between busy work weeks." },
      { author: "Peter L", rating: 5, body: "Good recurring cleaning service in Cape Town. The home feels reset after every visit." },
      { author: "Megan R", rating: 5, body: "Simple booking, fair pricing, and a neat standard clean for our apartment." },
    ],
  },
  {
    slug: "deep-cleaning",
    name: "Deep Cleaning",
    pricingKey: "deep",
    h1: "Deep Cleaning Services in Cape Town",
    description:
      "Professional deep cleaning services in Cape Town for homes that need a thorough, top-to-bottom clean.",
    intro:
      "Deep cleaning is designed for homes that need more than a quick refresh. Shalean cleaners spend extra time on build-up, high-touch surfaces, kitchens, bathrooms, corners, fixtures, and detail areas that are often missed during regular cleaning.",
    contentSections: [
      {
        heading: "Professional Deep Cleaning Services in Cape Town",
        paragraphs: [
          "Deep cleaning services in Cape Town are for homes that need a more thorough reset than standard cleaning. It is a strong choice before hosting guests, after renovations, during seasonal resets, or when kitchens and bathrooms need extra attention.",
          "Shalean cleaners focus on the parts of the home where build-up is most noticeable: taps, sinks, counters, bathroom surfaces, floors, fixtures, high-touch areas, and the corners that are easy to miss during routine maintenance.",
        ],
      },
      {
        heading: "More Detailed Than Standard Cleaning",
        paragraphs: [
          "A deep clean gives cleaners more time to work through detail areas and heavier build-up. It is not just a longer standard clean; it is a more focused service for homes that need sanitising, degreasing, and a full refresh.",
          "This makes deep cleaning ideal for move-outs, move-ins, post-hosting resets, family homes, and apartments that have not had professional cleaning for a while.",
        ],
      },
    ],
    includes: ["Full home deep cleaning", "Kitchen degreasing", "Bathroom sanitisation", "Dusting and detailing", "Floors, fixtures, and high-touch surfaces"],
    whoFor:
      "This service is ideal for homeowners, tenants, families, and hosts who need a reset before guests arrive, after a busy season, or before moving.",
    comparisonCopy: "More detailed than standard cleaning, deep cleaning is ideal for move-outs, guest preparation, and full-home refreshes.",
    urgencyCopy: "Same-day deep cleaning slots may be available in Cape Town when cleaner capacity allows.",
    pricingCopy:
      "Deep cleaning prices are based on property size, room count, bathrooms, extras, and the level of detail required. You see the exact price before payment.",
    imageAlt: "Professional deep cleaning service in Cape Town kitchen",
    faqs: [
      {
        q: "What is included in deep cleaning?",
        a: "Deep cleaning includes detailed cleaning of kitchens, bathrooms, floors, fixtures, high-touch surfaces, and living areas.",
      },
      {
        q: "How much is deep cleaning in Cape Town?",
        a: "Deep cleaning prices in Cape Town depend on home size, bedrooms, bathrooms, extras, and the amount of detail required. Your live quote appears before checkout.",
      },
      {
        q: "How long does a deep clean take?",
        a: "Deep cleans take longer than standard cleans because cleaners spend more time on build-up, detail work, and hard-to-reach areas.",
      },
      {
        q: "Is deep cleaning good before moving?",
        a: "Yes. Deep cleaning is a strong option before moving in, moving out, or preparing a home for inspection.",
      },
    ],
    reviews: [
      { author: "Lauren P", rating: 5, body: "The deep clean made our bathrooms and kitchen look new again." },
      { author: "Thandi M", rating: 5, body: "Very detailed, professional, and worth it for a full home reset." },
      { author: "Richard B", rating: 5, body: "Excellent deep cleaning team. They handled a large home without rushing." },
      { author: "Bianca L", rating: 5, body: "Best deep cleaning service in Cape Town for a proper pre-guest reset." },
      { author: "Jason D", rating: 5, body: "The cleaner spent real time on the kitchen, bathrooms, and floors. Big difference." },
    ],
  },
  {
    slug: "airbnb-cleaning",
    name: "Airbnb Cleaning",
    pricingKey: "airbnb",
    h1: "Airbnb Cleaning Services in Cape Town",
    description:
      "Reliable Airbnb cleaning services in Cape Town for hosts who need fast turnovers and spotless guest-ready results.",
    intro:
      "Airbnb cleaning is built for short-stay hosts who need consistent presentation between check-out and check-in. Shalean focuses on guest-ready bathrooms, kitchens, bedrooms, floors, and finishing details that influence reviews.",
    contentSections: [
      {
        heading: "Professional Airbnb Cleaning Services in Cape Town",
        paragraphs: [
          "Airbnb cleaning in Cape Town is different from normal home cleaning because timing and presentation matter. Hosts need a space that feels fresh, looks photo-ready, and can handle back-to-back guest turnover without quality slipping.",
          "Shalean focuses on the guest-sensitive areas that influence reviews: bathrooms, kitchens, beds, floors, bins, surfaces, and the final walk-through details that help a property feel ready for check-in.",
        ],
      },
      {
        heading: "Fast Turnover Cleaning for Hosts",
        paragraphs: [
          "Whether you manage a Sea Point apartment, a Green Point short-stay flat, or a family-friendly rental elsewhere in Cape Town, the goal is consistency. Guests notice dust, bathroom marks, kitchen residue, and poor presentation quickly.",
          "Airbnb turnover cleaning helps hosts protect ratings, reduce stress between bookings, and keep the property ready for the next arrival.",
        ],
      },
    ],
    includes: ["Guest-ready bathroom cleaning", "Kitchen reset", "Bedroom and linen-ready presentation", "Floor cleaning", "Turnover checklist support"],
    whoFor:
      "This service is best for Airbnb hosts, guesthouse operators, property managers, and owners who need reliable turnovers across Cape Town.",
    comparisonCopy: "More presentation-focused than standard cleaning, Airbnb cleaning is built around guest reviews and fast turnover timing.",
    urgencyCopy: "Same-day Airbnb cleaning slots may be available in Cape Town for urgent turnovers.",
    pricingCopy:
      "Airbnb cleaning pricing depends on property size, bedrooms, bathrooms, extras, and turnaround timing. Your quote updates before checkout.",
    imageAlt: "Airbnb cleaning service in Cape Town short-stay apartment",
    faqs: [
      {
        q: "Do you offer same-day Airbnb turnovers?",
        a: "Same-day Airbnb cleaning depends on cleaner availability and the requested time slot. Start a booking to see open slots.",
      },
      {
        q: "How long does Airbnb cleaning take?",
        a: "Airbnb cleaning time depends on bedrooms, bathrooms, property condition, and turnover requirements. Smaller apartments are usually faster than larger homes.",
      },
      {
        q: "Is Airbnb cleaning different from standard cleaning?",
        a: "Yes. Airbnb cleaning focuses on guest-ready presentation, fast turnover, bathrooms, kitchens, bedrooms, and review-sensitive details.",
      },
      {
        q: "Can Shalean clean between guest check-out and check-in?",
        a: "Yes, when availability allows. Choose your preferred time during booking.",
      },
    ],
    reviews: [
      { author: "Andre S", rating: 5, body: "Perfect for our Airbnb turnover. The apartment looked ready for photos." },
      { author: "Bianca L", rating: 5, body: "Reliable and fast between guest stays. It helps our reviews." },
      { author: "Megan R", rating: 5, body: "Guest-ready cleaning with a simple booking flow." },
      { author: "Sarah M", rating: 5, body: "Great Airbnb cleaning service in Cape Town when we need a quick changeover." },
      { author: "Daniel K", rating: 5, body: "Bathrooms, kitchen, and beds were ready before the next guest arrived." },
    ],
  },
  {
    slug: "move-out-cleaning",
    name: "Move Out Cleaning",
    pricingKey: "move",
    h1: "Move Out Cleaning Services in Cape Town",
    description:
      "Book move out cleaning services in Cape Town for tenants, landlords, and homeowners preparing a property handover.",
    intro:
      "Move out cleaning helps prepare a property for handover, inspection, new tenants, or sale. Shalean cleaners focus on kitchens, bathrooms, floors, cupboards, fixtures, and the areas that make a space feel ready for the next person.",
    contentSections: [
      {
        heading: "Move Out Cleaning Services in Cape Town",
        paragraphs: [
          "Move out cleaning in Cape Town is designed for properties that need to look ready for handover. Tenants, landlords, homeowners, and agents often need a cleaner finish than a normal maintenance clean can provide.",
          "Shalean focuses on the spaces that matter during inspections and handovers: kitchens, bathrooms, floors, built-ins, surfaces, fixtures, and visible marks that can make a property feel neglected.",
        ],
      },
      {
        heading: "Move-In, Move-Out, and Handover Cleaning",
        paragraphs: [
          "This service works well before moving into a new home, after moving out of a rental, or before listing a property for new occupants. The goal is to make the property feel clean, neutral, and ready for the next stage.",
          "Compared with standard cleaning, move out cleaning is more handover-focused and can be paired with extras such as cupboards, ovens, fridges, and windows where available.",
        ],
      },
    ],
    includes: ["Kitchen and bathroom cleaning", "Cupboard and built-in wipe-downs", "Floor cleaning", "Fixture and surface detailing", "Move-in and handover-ready finish"],
    whoFor:
      "This service is ideal for tenants, landlords, estate agents, homeowners, and families moving in or out of a property.",
    comparisonCopy: "More handover-focused than standard cleaning, move out cleaning is ideal before inspections, new tenants, or moving day.",
    urgencyCopy: "Same-day move out cleaning slots may be available in Cape Town for urgent handovers.",
    pricingCopy:
      "Move out cleaning prices depend on property size, condition, room count, and optional extras such as ovens, fridges, windows, and cabinets.",
    imageAlt: "Move out cleaning service in Cape Town empty home",
    faqs: [
      {
        q: "What is included in move out cleaning?",
        a: "Move out cleaning includes kitchens, bathrooms, floors, built-ins, fixtures, surfaces, and optional extras for a handover-ready finish.",
      },
      {
        q: "How much is move out cleaning in Cape Town?",
        a: "Move out cleaning prices in Cape Town depend on the property size, condition, room count, bathrooms, and selected extras.",
      },
      {
        q: "Can I book move-in cleaning too?",
        a: "Yes. The same service works well before moving into a new home or after moving out.",
      },
      {
        q: "Do you clean inside cupboards?",
        a: "Inside cupboards can be included as an extra where available in the booking flow.",
      },
    ],
    reviews: [
      { author: "Ayesha F", rating: 5, body: "Our move-out clean was handled professionally and the price was clear." },
      { author: "Kelly J", rating: 5, body: "Great for a rental handover. The kitchen and bathrooms were spotless." },
      { author: "Jason D", rating: 5, body: "Easy move-out booking and the cleaner arrived on time." },
      { author: "Nomsa T", rating: 5, body: "The move out cleaning helped us get the apartment ready before inspection." },
      { author: "Carmen V", rating: 5, body: "Very useful before moving into our new Cape Town home." },
    ],
  },
  {
    slug: "carpet-cleaning",
    name: "Carpet Cleaning",
    pricingKey: "carpet",
    h1: "Carpet Cleaning Services in Cape Town",
    description:
      "Book carpet cleaning services in Cape Town to refresh high-traffic rugs, carpets, and soft flooring as part of your home clean.",
    intro:
      "Carpet cleaning helps refresh rooms that collect dust, foot traffic, pet hair, and everyday marks. Shalean makes it easy to add carpet cleaning to a wider home cleaning plan.",
    contentSections: [
      {
        heading: "Carpet Cleaning Services in Cape Town",
        paragraphs: [
          "Carpet cleaning in Cape Town helps refresh high-traffic rooms, rugs, and soft flooring that collect dust, pet hair, and everyday marks. It is especially useful in living rooms, bedrooms, rental properties, and homes with children or pets.",
          "Shalean makes carpet cleaning part of a broader home cleaning plan, so customers can refresh floors while also booking kitchens, bathrooms, bedrooms, and general cleaning support.",
        ],
      },
      {
        heading: "Refresh High-Traffic Rugs and Carpets",
        paragraphs: [
          "Carpets and rugs often hold onto dust and foot traffic longer than hard floors. A carpet cleaning service helps the home feel fresher and supports seasonal resets, rental turnovers, and regular maintenance.",
          "Compared with standard cleaning, carpet cleaning is more focused on soft flooring and works best when paired with the right room-by-room cleaning plan.",
        ],
      },
    ],
    includes: ["High-traffic carpet refresh", "Rug and soft-flooring support", "Dust and surface lift", "Room-by-room planning", "Optional add-on with home cleaning"],
    whoFor:
      "This service is best for homes with pets, children, high-traffic living areas, rental properties, and seasonal refresh needs.",
    comparisonCopy: "More floor-focused than standard cleaning, carpet cleaning is ideal for rugs, bedrooms, lounges, and high-traffic areas.",
    urgencyCopy: "Same-day carpet cleaning availability in Cape Town depends on the selected service package and cleaner capacity.",
    pricingCopy:
      "Carpet cleaning prices depend on the room count, carpeted areas, property size, and selected service package.",
    imageAlt: "Carpet cleaning service in Cape Town home",
    faqs: [
      {
        q: "Can I add carpet cleaning to a home clean?",
        a: "Yes. Carpet cleaning can be booked as part of a wider home cleaning plan where available.",
      },
      {
        q: "How much is carpet cleaning in Cape Town?",
        a: "Carpet cleaning prices in Cape Town depend on room count, carpeted areas, property size, and your selected service package.",
      },
      {
        q: "Is carpet cleaning good for high-traffic areas?",
        a: "Yes. It is designed to refresh carpets and rugs in rooms that collect frequent dust and foot traffic.",
      },
      {
        q: "How is carpet cleaning priced?",
        a: "Pricing depends on room count, carpeted areas, and your selected cleaning package.",
      },
    ],
    reviews: [
      { author: "Chantel V", rating: 5, body: "The carpets in our living area looked much fresher after the clean." },
      { author: "Priya K", rating: 5, body: "Good carpet cleaning add-on with clear pricing." },
      { author: "Dylan M", rating: 5, body: "Easy to book and useful for high-traffic apartment carpets." },
      { author: "Lerato S", rating: 5, body: "Helpful carpet cleaning service for our family home in Cape Town." },
      { author: "Michael R", rating: 5, body: "The rug and lounge carpets felt much cleaner after the booking." },
    ],
  },
];

export function getService(slug: string): ServicePageConfig | null {
  return SERVICES.find((service) => service.slug === slug) ?? null;
}
