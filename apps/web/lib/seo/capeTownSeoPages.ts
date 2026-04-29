import type { Metadata } from "next";

const SITE = "https://www.shalean.co.za";

export const CAPE_TOWN_SEO_SERVICE_SLUGS = [
  "deep-cleaning-cape-town",
  "standard-cleaning-cape-town",
  "move-out-cleaning-cape-town",
  "office-cleaning-cape-town",
  "airbnb-cleaning-cape-town",
  "carpet-cleaning-cape-town",
] as const;

export type CapeTownSeoServiceSlug = (typeof CAPE_TOWN_SEO_SERVICE_SLUGS)[number];

export const LOCATION_SEO_SLUGS = [
  "claremont-cleaning-services",
  "wynberg-cleaning-services",
  "rondebosch-cleaning-services",
  "kenilworth-cleaning-services",
  "observatory-cleaning-services",
  "newlands-cleaning-services",
  "rosebank-cleaning-services",
] as const;

export type LocationSeoSlug = (typeof LOCATION_SEO_SLUGS)[number];

export type CapeTownServiceSeoBlock = {
  slug: CapeTownSeoServiceSlug;
  path: string;
  title: string;
  description: string;
  ogImage: string;
  h1: string;
  /** Short booking label for CTAs */
  bookingLabel: string;
  /** Defaults to `/booking?step=entry` in the page component */
  bookingPath?: string;
  /** Defaults to "How this service works in Cape Town" */
  introSectionHeading?: string;
  explanation: string[];
  included: string[];
  benefits: { title: string; body: string }[];
  /** e.g. hosts & property managers */
  targetAudience?: { heading: string; paragraphs: string[] };
  /** Replaces default suburb pills when set (e.g. subset + booking link) */
  areaLinks?: { href: string; label: string }[];
  areasSectionHeading?: string;
  areasSectionIntro?: string;
  /** Hero image (required): SEO filename + descriptive alt for LCP and rich previews */
  heroImage: { src: string; alt: string };
  /** 3–5 natural Q&As for on-page FAQ + FAQPage JSON-LD */
  faqs: { q: string; a: string }[];
};

export type LocationSeoBlock = {
  slug: LocationSeoSlug;
  path: string;
  title: string;
  description: string;
  ogImage: string;
  h1: string;
  intro: string[];
  localAngle: string[];
  whyChoose: string[];
  bookingLabel: string;
};

export const CAPE_TOWN_SERVICE_SEO: Record<CapeTownSeoServiceSlug, CapeTownServiceSeoBlock> = {
  "deep-cleaning-cape-town": {
    slug: "deep-cleaning-cape-town",
    path: "/services/deep-cleaning-cape-town",
    title: "Deep Cleaning Cape Town | Book Vetted Cleaners | Shalean",
    description:
      "Professional deep cleaning in Cape Town for kitchens, bathrooms, floors, and detail work. Vetted cleaners, clear pricing, and online booking with Shalean.",
    ogImage: "/images/marketing/deep-cleaning-cape-town-kitchen.webp",
    h1: "Deep cleaning services in Cape Town for homes that need a real reset",
    bookingLabel: "deep cleaning",
    areasSectionIntro:
      "Southern Suburb hubs from Claremont to Rosebank spell out parking, pets, and typical layouts so your booking notes match what teams see on the day. Skim them for neighbourhood context, then confirm this deep cleaning scope for Cape Town before you checkout.",
    explanation: [
      "Deep cleaning is the service Cape Town customers choose when a standard tidy is not enough. Build-up on ovens, grout lines, skirting boards, and bathroom fixtures takes time, and Shalean teams are briefed to work through those detail zones methodically.",
      "Whether you are recovering after renovations, preparing for guests, or refreshing a rental before handover photos, deep cleaning focuses on the areas that change how a space feels day to day across the Western Cape seaboard and Southern Suburbs.",
      "If you are comparing house cleaning Cape Town options, think of professional cleaning services as the layer that restores kitchens and bathrooms after busy weeks—while home cleaning services Cape Town wide stay easier to maintain once the heavy reset is done.",
    ],
    included: [
      "Kitchen degrease, appliance fronts, counters, and sinks",
      "Bathroom descale, sanitaryware, mirrors, and fixtures",
      "Dusting reachable surfaces, corners, and high-touch areas",
      "Vacuuming and mopping hard floors according to your booking scope",
      "Living areas and bedrooms refreshed to an agreed checklist",
    ],
    benefits: [
      {
        title: "Clear scope before the team arrives",
        body: "You choose home size and add-ons online so the visit matches what you expect—especially important for larger Cape Town family homes.",
      },
      {
        title: "Vetted cleaners with structured checklists",
        body: "Teams follow a consistent process so kitchens and bathrooms receive the extra time deep cleans need.",
      },
      {
        title: "Built for busy Cape Town schedules",
        body: "Pick a slot that fits work-from-home days, school runs, or Airbnb turnovers without endless phone tag.",
      },
    ],
    heroImage: {
      src: "/images/marketing/deep-cleaning-cape-town-kitchen.webp",
      alt: "Professional deep cleaning service in Cape Town kitchen",
    },
    faqs: [
      {
        q: "How long does a deep clean usually take in Cape Town?",
        a: "It depends on home size, bathrooms, extras, and how much build-up there is. Larger Southern Suburb homes and post-renovation resets need more time than a compact apartment. You choose bedrooms, bathrooms, and add-ons online so we can allocate a realistic visit length before the team arrives.",
      },
      {
        q: "What is the difference between deep cleaning and standard cleaning?",
        a: "Standard cleaning maintains a weekly baseline—surfaces, floors, kitchens, and bathrooms on a lighter schedule. Deep cleaning spends extra time on detail zones like grout lines, appliance fronts, skirting, and bathrooms that have accumulated limescale or grease. If you are unsure, start a quote and compare what each tier includes for your rooms.",
      },
      {
        q: "Do I need to be home while the cleaners work?",
        a: "Not always. Many Cape Town customers leave clear access notes, parking guidance, and alarm or estate rules in the booking. If you prefer to meet the team on the first visit, that works too—just mention it in your notes so we can plan arrival.",
      },
      {
        q: "Is deep cleaning a good idea before guests or after renovations?",
        a: "Yes. Deep cleaning is a strong fit when you want kitchens and bathrooms to feel noticeably fresher before hosting, or when dust and trades residue are still settling after building work. Tell us about renovation dust or delicate finishes in your booking notes.",
      },
      {
        q: "Can I book deep cleaning as a once-off without committing to recurring visits?",
        a: "Yes. Many customers use deep cleaning as a seasonal reset, pre-sale refresh, or post-build clean, then return to lighter schedules later. Choose once-off during booking and add bedrooms, bathrooms, and extras so the quote reflects the time the job truly needs.",
      },
    ],
  },
  "standard-cleaning-cape-town": {
    slug: "standard-cleaning-cape-town",
    path: "/services/standard-cleaning-cape-town",
    title: "Standard Cleaning Cape Town | Weekly or Once-Off | Shalean",
    description:
      "Standard home cleaning in Cape Town for weekly or once-off visits. Fresh kitchens, bathrooms, and floors—transparent quotes and vetted Shalean cleaners.",
    ogImage: "/images/marketing/standard-cleaning-cape-town-kitchen.webp",
    h1: "Standard cleaning services in Cape Town for consistent, livable homes",
    bookingLabel: "standard cleaning",
    areasSectionIntro:
      "Each suburb hub below highlights how standard visits usually run there—stairs, shared drives, school-run timing, and typical room counts. Use them to brief your booking, then align expectations with the baseline checklist on this Cape Town service page.",
    explanation: [
      "Standard cleaning keeps Cape Town apartments and houses in a steady rhythm: floors walked daily, kitchens used nightly, and bathrooms that need dependable sanitisation without booking a full deep clean every time.",
      "It suits professionals near the CBD, families in the Southern Suburbs, and lock-up-and-go homes that still deserve a reliable reset on a predictable schedule.",
      "Across house cleaning Cape Town demand, professional cleaning services like this one protect your week: home cleaning services Cape Town customers book most often focus on high-touch surfaces, fresh floors, and bathrooms guests actually notice.",
    ],
    included: [
      "Kitchen surfaces, exterior of appliances, and sink area",
      "Bathroom sanitisation and wipe-down of fixtures",
      "Dusting of reachable surfaces in living areas and bedrooms",
      "Vacuuming carpets and rugs where applicable",
      "Mopping hard floors according to your booking details",
    ],
    benefits: [
      {
        title: "Predictable quality between deep cleans",
        body: "Maintain a baseline that makes deep cleans less frequent and weekend recovery time shorter.",
      },
      {
        title: "Transparent pricing before checkout",
        body: "See how bedrooms, bathrooms, and extras affect your total for Cape Town properties.",
      },
      {
        title: "Easy rebooking after your first visit",
        body: "Save details securely and return when you need the same team rhythm again.",
      },
    ],
    heroImage: {
      src: "/images/marketing/standard-cleaning-cape-town-kitchen.webp",
      alt: "Professional standard home cleaning service in a Cape Town kitchen and living space",
    },
    faqs: [
      {
        q: "Can I book recurring standard cleaning for my Cape Town home?",
        a: "Yes. Weekly, bi-weekly, and monthly schedules are common for apartments and family homes that want a steady baseline. You set bedrooms, bathrooms, and extras online, then adjust frequency after your first visit if your needs change.",
      },
      {
        q: "What is typically included in a standard home clean?",
        a: "Standard visits focus on high-use areas: kitchen surfaces and sink, bathroom sanitisation, dusting of reachable surfaces, vacuuming carpets and rugs where applicable, and mopping hard floors according to your booking scope. Exact inclusions follow the checklist tied to your quote.",
      },
      {
        q: "How do I know what standard cleaning will cost before I pay?",
        a: "Pricing is based on home size, bedrooms, bathrooms, extras, and your selected time slot. Shalean shows a live total during booking so you can compare options before checkout—no surprise surcharges for items that are already in your selected scope.",
      },
      {
        q: "Do cleaners bring supplies and equipment?",
        a: "Yes. Teams arrive with professional supplies suited to typical Cape Town finishes. If you prefer specific products—for example on wooden floors or stone—add that to your booking notes and we will align where possible.",
      },
      {
        q: "What if my home needs more than standard cleaning this month?",
        a: "You can book a deeper tier for a single visit when bathrooms or kitchens have extra build-up, then return to standard cadence afterwards. Compare tiers in the booking flow so time and pricing match the condition you are seeing today.",
      },
    ],
  },
  "move-out-cleaning-cape-town": {
    slug: "move-out-cleaning-cape-town",
    path: "/services/move-out-cleaning-cape-town",
    title: "Move-Out Cleaning Cape Town | Lease Handover Ready | Shalean",
    description:
      "Move-out cleaning in Cape Town for tenants and landlords: kitchens, bathrooms, floors, and handover detail. Book a deposit-ready clean with Shalean online.",
    ogImage: "/images/marketing/move-out-cleaning-cape-town-handover.webp",
    h1: "Move-out cleaning services in Cape Town for stress-free handovers",
    bookingLabel: "move-out cleaning",
    areasSectionIntro:
      "Lease-end friction shifts by suburb—narrow drives, estate gates, and inspection habits differ. The location hubs below capture those cues; pair them with this move-out checklist so Cape Town kitchens, bathrooms, and floors read handover-ready.",
    explanation: [
      "End-of-lease pressure is familiar across Cape Town rentals: inventory checks, deposit timelines, and keys due the same morning. A move-out clean concentrates on the evidence areas inspectors notice first—grease, limescale, floor edges, and built-up dust behind furniture marks.",
      "Shalean focuses on a structured handover scope so you can align cleaning timing with your removalists and key exchange, whether you are leaving a Sea Point apartment or a family house further inland.",
      "When house cleaning Cape Town timelines collide with moving day, professional cleaning services keep the job scoped: home cleaning services Cape Town tenants book for handover should still prioritise kitchens, bathrooms, and floors agents photograph first.",
    ],
    included: [
      "Kitchen deep wipe including cupboards exteriors where in scope",
      "Bathroom descale and sanitisation for handover presentation",
      "Inside windowsills and tracks where included in your tier",
      "Floor vacuum and mop through living spaces and bedrooms",
      "Skirting, doors, and high-touch surfaces addressed on checklist",
    ],
    benefits: [
      {
        title: "Deposit-friendly attention to detail",
        body: "Prioritise the areas that commonly appear on Western Cape rental inspection sheets.",
      },
      {
        title: "Coordinate around your move date",
        body: "Book the slot that sits between packing chaos and the final walkthrough.",
      },
      {
        title: "One invoice, online payment",
        body: "Keep records simple when you are already managing movers and utilities.",
      },
    ],
    heroImage: {
      src: "/images/marketing/move-out-cleaning-cape-town-handover.webp",
      alt: "Move-out cleaning for a handover-ready Cape Town home before keys are returned",
    },
    faqs: [
      {
        q: "When should I schedule move-out cleaning around handover day?",
        a: "Book after furniture is out and rubbish is cleared, but while you still have access for a final walkthrough. Many tenants aim for the day before keys are due so there is buffer if the agency requests touch-ups. Add your handover time in booking notes so we can suggest a realistic slot.",
      },
      {
        q: "Does move-out cleaning include inside ovens, fridges, or cupboards?",
        a: "Cupboard exteriors and standard handover surfaces are usually in scope. Interiors like ovens, fridges, or inside cupboards are often booked as extras when your inventory or lease requires them—select those add-ons during quoting so the team brings enough time.",
      },
      {
        q: "Is this service suitable for Western Cape rental inspections?",
        a: "Move-out cleaning is built around the areas inspectors notice first: kitchens, bathrooms, floors, skirting, and built-up dust at edges. It does not replace repairs or painting, but it helps present a neutral, handover-ready finish for typical Cape Town rental checklists.",
      },
      {
        q: "Can a landlord book move-out cleaning for an outgoing tenant?",
        a: "Yes. Landlords and agents often book ahead of new tenants or viewings. Use the booking flow to specify access, parking, and any estate security steps so cleaners can complete the scope without delays.",
      },
      {
        q: "What if the agent requests touch-ups after the move-out clean?",
        a: "Share photos and the agency checklist quickly through support so we can advise whether a short revisit or targeted add-on makes sense. Clear before-and-after expectations in your original booking notes reduce surprises on narrow Cape Town handover days.",
      },
    ],
  },
  "office-cleaning-cape-town": {
    slug: "office-cleaning-cape-town",
    path: "/services/office-cleaning-cape-town",
    title: "Office Cleaning Cape Town | Small Workspaces | Shalean",
    description:
      "Office cleaning in Cape Town for small teams, studios, and hybrid workspaces. Sanitised kitchens, bathrooms, and desks—book consistent visits with Shalean.",
    ogImage: "/images/marketing/office-cleaning-cape-town-workspace.webp",
    h1: "Office cleaning services in Cape Town for productive, presentable workspaces",
    bookingLabel: "office cleaning",
    areasSectionIntro:
      "Studios near Rosebank duplexes behave differently from Newlands village-adjacent offices. Skim the suburb hubs for access and parking norms, then map your workspace visit to the checklist on this Cape Town office cleaning page.",
    explanation: [
      "Small offices, agency studios, and hybrid workspaces across Cape Town need the same fundamentals as homes—sanitised kitchens, presentable bathrooms, dust-free desks, and floors that look professional when clients visit.",
      "Shalean treats office bookings with the same vetted cleaner model as residential work, with scope agreed up front so communal fridges, glass partitions, and high-traffic corridors get proportionate time.",
      "Professional cleaning services for offices mirror house cleaning Cape Town customers expect at home: predictable standards, respectful access, and clear scope. Many teams pair occasional home cleaning services Cape Town bookings with a light office cadence under one account.",
    ],
    included: [
      "Kitchenette and staff fridge exterior wipe-down",
      "Bathroom and basin sanitisation for shared facilities",
      "Meeting room tidy, surface dust, and chair-line vacuum as scoped",
      "Reception and open-plan desk zones vacuumed and spot-cleaned",
      "Bin liner refresh and floor mopping for hard surfaces in scope",
    ],
    benefits: [
      {
        title: "First impressions for walk-in clients",
        body: "Keep reception and meeting areas consistently ready without pulling staff off revenue work.",
      },
      {
        title: "Flexible cadence",
        body: "Choose weekly, bi-weekly, or project cleans around your Cape Town lease and headcount.",
      },
      {
        title: "One partner for home and work",
        body: "Many customers book residential and small-office visits under one account for simpler admin.",
      },
    ],
    heroImage: {
      src: "/images/marketing/office-cleaning-cape-town-workspace.webp",
      alt: "Professional office cleaning team preparing a bright workspace in Cape Town",
    },
    faqs: [
      {
        q: "What kinds of offices do you clean in Cape Town?",
        a: "We focus on small offices, studios, and hybrid workspaces: reception, desks, meeting rooms, kitchenettes, and shared bathrooms. Scope is agreed up front so high-traffic corridors and client-facing areas get enough time without pulling your staff off their work.",
      },
      {
        q: "Can we book office cleaning outside normal business hours?",
        a: "When availability allows, yes—many teams prefer early mornings or late afternoons around the CBD and Southern Suburbs. Tell us your preferred window and access rules in booking notes so we can match you with a slot that fits your lease and security process.",
      },
      {
        q: "How often should a small office schedule cleaning?",
        a: "Most teams on weekly or bi-weekly cadence keep kitchens and bathrooms presentable without weekend catch-up. Heavier foot traffic or client walk-ins may need weekly visits; lighter use can start bi-weekly and adjust after the first clean.",
      },
      {
        q: "Are office cleaners vetted like residential teams?",
        a: "Yes. Shalean uses the same vetted cleaner model for office bookings, with structured checklists and feedback after visits so quality stays visible—not buried in ad-hoc messages.",
      },
      {
        q: "Do you clean large corporate campuses or medical suites?",
        a: "We focus on compact offices and hybrid workspaces rather than large campuses or regulated clinical environments. If you are unsure, start a quote with square metres, headcount, and photos of shared kitchens or bathrooms so we can confirm fit before checkout.",
      },
    ],
  },
  "airbnb-cleaning-cape-town": {
    slug: "airbnb-cleaning-cape-town",
    path: "/services/airbnb-cleaning-cape-town",
    title: "Airbnb Cleaning Cape Town | Guest Turnovers | Shalean",
    description:
      "Airbnb turnover cleaning in Cape Town for fast guest changeovers. Photo-ready resets, vetted cleaners, and clear scope—book online with Shalean today.",
    ogImage: "/images/marketing/airbnb-cleaning-cape-town-living-room.webp",
    h1: "Airbnb cleaning services in Cape Town for guest-ready homes",
    bookingLabel: "Airbnb turnover cleaning",
    bookingPath: "/booking",
    introSectionHeading: "Built for Airbnb hosts in Cape Town",
    areasSectionIntro:
      "Turnover pressure is street-specific—tight lifts on the Atlantic Seaboard versus Southern Suburb gates and school traffic. The hubs below capture local access cues; combine them with this Cape Town Airbnb cleaning checklist for consistent guest-ready results.",
    explanation: [
      "Between back-to-back guests, calendar gaps, and same-day check-outs, Airbnb hosts need a turnover partner that respects inventory photos, linen resets, and tight handover windows—not just a generic tidy.",
      "Shalean focuses on short-stay realities across Cape Town: sand tracked in from the beach, coffee rings on dining tables, and bathrooms that must read “hotel fresh” before your next review arrives.",
      "Hosts still compare house cleaning Cape Town providers on speed and trust; professional cleaning services built for turnovers layer staging, odour control, and high-touch wipes on top of standard home cleaning services Cape Town guests expect between stays.",
    ],
    included: [
      "Kitchen reset: counters, hob, sink, exterior of appliances, and bin refresh",
      "Bathroom sanitisation, mirrors, fixtures, and restocking of consumables you leave out",
      "Living and bedroom surfaces dusted, floors vacuumed and mopped to photo-ready finish",
      "High-touch points (remotes, handles, switches) wiped down for guest confidence",
      "Turnover extras when selected: linen change staging, inside-fridge wipe, balcony sweep",
    ],
    benefits: [
      {
        title: "Speed that matches your calendar",
        body: "Book tight slots around check-out and check-in so listings flip without losing a night’s revenue.",
      },
      {
        title: "Reliable vetted teams",
        body: "The same structured checklist model we use for homes—applied to guest-ready presentation every time.",
      },
      {
        title: "Consistent guest-ready standards",
        body: "Reduce variance between cleans so ratings stay steady even when you are out of town.",
      },
    ],
    targetAudience: {
      heading: "Who this is for",
      paragraphs: [
        "Independent Airbnb hosts managing one or two Cape Town listings who need dependable turnovers without micromanaging every visit.",
        "Property managers coordinating multiple short-stay units, lockboxes, and remote access—especially across the Southern Suburbs and Atlantic Seaboard corridors.",
      ],
    },
    heroImage: {
      src: "/images/marketing/airbnb-cleaning-cape-town-living-room.webp",
      alt: "Short-stay rental living room after professional Airbnb turnover cleaning in Cape Town",
    },
    faqs: [
      {
        q: "Can you handle same-day check-out and check-in in Cape Town?",
        a: "Often yes, when the gap between guests and cleaner availability lines up. Tight Atlantic Seaboard or CBD turnovers work best when you share exact check-out and check-in times, remote access details, and linen expectations in your booking notes so the team can plan realistically.",
      },
      {
        q: "What is included in a typical Airbnb turnover clean?",
        a: "Turnovers usually cover kitchen reset, bathroom sanitisation and mirrors, living and bedroom surfaces, vacuuming and mopping to a photo-ready finish, bin refresh, and high-touch points like remotes and handles. Add-ons such as linen staging or inside-fridge wipes can be selected when you build your quote.",
      },
      {
        q: "How should I leave access instructions for cleaners?",
        a: "Use the booking notes for gate codes, estate rules, lockbox locations, and Wi-Fi only if needed for equipment. Precise parking guidance for Southern Suburbs streets saves time on narrow roads and school-zone arrivals.",
      },
      {
        q: "Do you restock guest toiletries or change linen?",
        a: "Teams can work with consumables and linen you leave out, and you can add turnover extras when you want staging support. Exact restocking depends on what you supply and what you select in the booking flow—list consumable locations clearly for consistent results.",
      },
      {
        q: "How far ahead should I book during Cape Town peak season?",
        a: "Holiday and summer weeks fill faster—booking as soon as you know check-out times reduces stress. If plans change, update your slot early so we can reallocate capacity and keep your listing on calendar.",
      },
    ],
  },
  "carpet-cleaning-cape-town": {
    slug: "carpet-cleaning-cape-town",
    path: "/services/carpet-cleaning-cape-town",
    title: "Carpet Cleaning Cape Town | Rugs & High Traffic | Shalean",
    description:
      "Carpet cleaning in Cape Town for rugs, bedrooms, and high-traffic rooms. Refresh soft floors alone or with home cleaning—clear pricing from Shalean.",
    ogImage: "/images/marketing/carpet-cleaning-cape-town-sofas-rugs.webp",
    h1: "Carpet cleaning services in Cape Town for fresher rugs, carpets, and high-traffic rooms",
    bookingLabel: "carpet cleaning",
    areasSectionIntro:
      "Rugs in Observatory rentals behave differently from Kenilworth family lounges. Browse the suburb hubs for context on access and typical room mixes, then align carpet scope and any bundled home clean on this Cape Town service page.",
    explanation: [
      "Carpet cleaning helps refresh rooms that collect dust, foot traffic, pet hair, and everyday marks. Shalean makes it easy to add carpet cleaning to a wider home cleaning plan when you want kitchens, bathrooms, and living spaces handled in the same visit.",
      "Carpet cleaning in Cape Town is especially useful in living rooms, bedrooms, rental properties, and homes with children or pets—where soft flooring holds onto dust and marks longer than hard floors.",
      "Pairing soft-floor work with professional cleaning services keeps one team accountable: house cleaning Cape Town customers often bundle hard surfaces first, then home cleaning services Cape Town wide add rug refresh where traffic is heaviest.",
    ],
    included: [
      "High-traffic carpet refresh",
      "Rug and soft-flooring support",
      "Dust and surface lift on agreed carpeted areas",
      "Room-by-room planning aligned to your booking scope",
      "Optional add-on with standard or deep home cleaning where you select it",
    ],
    benefits: [
      {
        title: "Built for busy Cape Town households",
        body: "Ideal for pets, children, rentals, and seasonal resets when lounges and bedrooms need a dependable floor refresh.",
      },
      {
        title: "Clear scope before the team arrives",
        body: "You set rooms, carpeted areas, and service package online so the visit matches what you expect—especially in larger family homes.",
      },
      {
        title: "Transparent pricing before checkout",
        body: "See how room count, carpeted areas, and bundled home cleaning affect your total for Cape Town properties.",
      },
    ],
    heroImage: {
      src: "/images/marketing/carpet-cleaning-cape-town-sofas-rugs.webp",
      alt: "Carpet and upholstery care during a professional carpet cleaning visit in Cape Town",
    },
    faqs: [
      {
        q: "Can I add carpet cleaning to a standard or deep home clean?",
        a: "Yes. Many Cape Town customers bundle carpet or rug refresh with a wider home visit so bedrooms and lounges are handled in one trip. Select carpet scope and any home-clean tier during booking so the team brings enough time for both soft floors and hard surfaces.",
      },
      {
        q: "How is carpet cleaning priced for different home sizes?",
        a: "Quotes reflect carpeted areas, room count, and whether carpet work is standalone or bundled with other services. Your total updates live in the booking flow before you pay—add accurate room notes so pricing matches the visit.",
      },
      {
        q: "Will carpet cleaning help with pet hair and everyday traffic marks?",
        a: "Professional carpet refresh targets dust, hair, and traffic marks on agreed areas. Severe staining or odour may need extra time or specialist treatment—describe pets, rugs versus wall-to-wall carpet, and problem spots in your notes so we can set expectations.",
      },
      {
        q: "How long should I wait before walking on cleaned carpets?",
        a: "Drying time varies with ventilation, fibre type, and humidity. Your team can advise on the day; light foot traffic is often fine sooner on rugs moved to safer zones. Ask in notes if you need a hard finish-by time before guests arrive.",
      },
      {
        q: "Should I vacuum before the carpet team arrives?",
        a: "A quick vacuum of loose debris helps, especially after pets or renovations, but it is not mandatory. Note heavy shedding, recent plaster dust, or damp spots in your booking so the team plans dwell time and ventilation for Cape Town humidity.",
      },
    ],
  },
};

export const LOCATION_SEO_PAGES: Record<LocationSeoSlug, LocationSeoBlock> = {
  "claremont-cleaning-services": {
    slug: "claremont-cleaning-services",
    path: "/locations/claremont-cleaning-services",
    title: "Claremont Cleaning Cape Town | Southern Suburbs | Shalean",
    description:
      "Claremont cleaning in Cape Town for apartments and family homes near schools and retail. Professional home cleaning and deep cleans—book Shalean online.",
    ogImage: "/images/marketing/professional-cleaner-vacuum-bedroom-cape-town.webp",
    h1: "Claremont cleaning services in Cape Town for Southern Suburb homes and busy weeks",
    bookingLabel: "cleaning in Claremont",
    intro: [
      "Claremont sits where Southern Suburb families, students, and professionals overlap—homes range from compact apartments near Main Road to larger properties tucked off arterial routes. That mix means cleaning requests swing from fast Airbnb turnovers to recurring school-week upkeep.",
      "Shalean serves Claremont as part of the wider Cape Town footprint, with bookings tailored to your address, bedrooms, bathrooms, and the service intensity you need.",
      "Whether you need house cleaning Cape Town families rely on between terms or professional cleaning services before guests arrive, Claremont addresses still map to the same transparent quoting flow used across the metro.",
    ],
    localAngle: [
      "Proximity to schools and retail means many Claremont households want early-morning or mid-day slots that fit around lifts and errands. Mentioning access instructions and parking in your booking notes helps teams arrive smoothly.",
      "Leaf litter, pets, and high foot traffic between living rooms and kitchens are common—tell us about pets and floor types so we can allocate time realistically.",
    ],
    whyChoose: [
      "Vetted cleaners with structured checklists suited to suburban layouts.",
      "Instant pricing online before you commit—no surprise surcharges for standard scope items.",
      "Support channel if something is missed so we can make it right quickly.",
    ],
  },
  "wynberg-cleaning-services": {
    slug: "wynberg-cleaning-services",
    path: "/locations/wynberg-cleaning-services",
    title: "Wynberg Cleaning Cape Town | Homes & Rentals | Shalean",
    description:
      "Wynberg cleaning in Cape Town for character homes and busy school-week calendars. Standard, deep, or move-out cleaning—book vetted Shalean teams online.",
    ogImage: "/images/marketing/bright-living-room-after-cleaning-cape-town.webp",
    h1: "Wynberg cleaning services in Cape Town near parks, schools, and Main Road",
    bookingLabel: "cleaning in Wynberg",
    intro: [
      "Wynberg combines older character homes with newer infill, often with gardens, pets, and busy weekday calendars. Cleaning here is less about “quick tidies” and more about dependable cycles that keep sand, pet hair, and kitchen grease from compounding between visits.",
      "From Upper Wynberg down toward the retail strip, Shalean schedules Cape Town cleaners who understand that Southern Suburb traffic and school-zone parking affect arrival windows—clear notes in your booking reduce friction on the day.",
      "Home cleaning services Cape Town hosts and families expect still come down to scoped visits: tell us about Wynberg’s leafy gutters, pets, and floor finishes so professional cleaning services match the time on your quote.",
    ],
    localAngle: [
      "If you live near Maynardville or the village pocket, mention gate remotes and pedestrian access so the team meets security expectations common in the area.",
      "Older wooden floors and tiled passages respond better when you flag floor products you prefer; add that to booking notes if you want supplies adapted.",
    ],
    whyChoose: [
      "Service levels from standard upkeep through deep and move-out cleans mapped to real Wynberg home types.",
      "Online booking with transparent totals for Cape Town suburbs before checkout.",
      "Feedback loop after visits so quality stays visible to operations—not buried in DMs.",
    ],
  },
  "rondebosch-cleaning-services": {
    slug: "rondebosch-cleaning-services",
    path: "/locations/rondebosch-cleaning-services",
    title: "Rondebosch Cleaning Cape Town | Homes & Rentals | Shalean",
    description:
      "Rondebosch cleaning in Cape Town for rentals, student lets, and family houses. Standard, deep, or move-out scope—book vetted Shalean cleaners online.",
    ogImage: "/images/marketing/cleaning-team-bright-space-cape-town.webp",
    h1: "Rondebosch cleaning services in Cape Town for students, families, and rentals",
    bookingLabel: "cleaning in Rondebosch",
    intro: [
      "Rondebosch blends university-adjacent rentals with long-standing family streets, so cleaning demand shifts between compact flats that need fast bathroom and kitchen resets and multi-bedroom homes that want fuller floor-to-ceiling attention.",
      "Shalean supports Cape Town customers here with the same online quoting model used across the metro: you set rooms, bathrooms, extras, and intensity, then lock a slot that respects UCT-term noise and access realities where relevant.",
      "When Rondebosch flats need house cleaning Cape Town students can split fairly, pick scoped standard visits; for lease-end, move-out professional cleaning services keep ovens, bathrooms, and floors aligned with agency checklists.",
    ],
    localAngle: [
      "Split-level homes and hillside drives are common—precise address pins and parking guidance prevent delays on narrow roads.",
      "If you are booking around lease-end in a student let, choose move-out scope and add oven or fridge extras where inventory lists require it.",
    ],
    whyChoose: [
      "Scoped visits so you are not paying for deep detail when you only need a mid-term refresh—or vice versa.",
      "Cleaners briefed for Cape Town rental realities: limescale, coastal dust, and high-use kitchens.",
      "Secure card payment and email confirmation so flatmates or landlords share a paper trail easily.",
    ],
  },
  "kenilworth-cleaning-services": {
    slug: "kenilworth-cleaning-services",
    path: "/locations/kenilworth-cleaning-services",
    title: "Kenilworth Cleaning Cape Town | Leafy Suburbs | Shalean",
    description:
      "Kenilworth cleaning in Cape Town for cottages, family homes, and apartments near parks. Standard, deep, and Airbnb-ready cleans—book Shalean online.",
    ogImage: "/images/marketing/house-deep-cleaning-cape-town.webp",
    h1: "Kenilworth cleaning services in Cape Town for leafy homes and busy households",
    bookingLabel: "cleaning in Kenilworth",
    intro: [
      "Kenilworth sits in the heart of Cape Town’s Southern Suburbs—think established gardens, older cottages with character, and newer builds tucked off quieter streets. Sand from weekend sport, pet traffic through passages, and kitchens that work hard during school terms all add up between professional visits.",
      "Shalean serves Kenilworth as part of our wider Cape Town network: you choose bedrooms, bathrooms, extras, and service intensity online, then lock a slot that fits school runs, work-from-home days, or guest changeovers.",
      "Kenilworth customers comparing home cleaning services Cape Town wide still benefit from suburb-specific notes—driveways, dogs, and wooden floors shape how professional cleaning services allocate time on the day.",
    ],
    localAngle: [
      "Many Kenilworth properties have side drives, shared walls, or estate-style access—clear gate codes and parking notes in your booking help teams arrive without circling narrow cul-de-sacs.",
      "If you are near green belts or large trees, mention outdoor dust and leaf debris so we can budget vacuum time realistically for Cape Town’s windy weeks.",
    ],
    whyChoose: [
      "Structured checklists from standard upkeep through deep and move-out cleans, tuned to suburban layouts common in Kenilworth.",
      "Transparent Cape Town pricing before checkout—no guessing once rooms and extras are selected.",
      "Feedback after visits so missed details are visible to operations and can be corrected quickly.",
    ],
  },
  "observatory-cleaning-services": {
    slug: "observatory-cleaning-services",
    path: "/locations/observatory-cleaning-services",
    title: "Observatory Cleaning Cape Town | Shares & Flats | Shalean",
    description:
      "Observatory cleaning in Cape Town for student flats, shared houses, and walkable Main Road homes. Move-out, standard, or deep cleaning—book Shalean online.",
    ogImage: "/images/marketing/cleaning-team-bright-space-cape-town.webp",
    h1: "Observatory cleaning services in Cape Town for rentals, shares, and compact living",
    bookingLabel: "cleaning in Observatory",
    intro: [
      "Observatory blends Cape Town student life with young professionals and long-term residents along Main Road and side streets—compact kitchens, high-turnover bathrooms, and shared spaces that need predictable resets between busy weeks.",
      "Shalean brings the same metro-wide booking model to Observatory: set your address, room count, and add-ons, then see an instant total before you pay—whether you need a once-off deep clean or recurring standard visits.",
      "Shared houses here often rotate chores unevenly—booking house cleaning Cape Town students can split keeps kitchens and bathrooms consistent, while move-out professional cleaning services align with joint lease inspections.",
    ],
    localAngle: [
      "Street parking and security gates vary block by block—pin your exact entrance and mention buzzer or remote steps so cleaners are not delayed during Cape Town peak traffic.",
      "If you are mid-lease in a shared house, note common-area expectations in booking comments so scope matches what flatmates already agreed.",
    ],
    whyChoose: [
      "Move-out and deep options mapped to rental realities in Observatory—limescale, grease, and high-use kitchens.",
      "Online booking built for Cape Town addresses with clear scope before checkout.",
      "Vetted cleaners and post-visit feedback so quality stays accountable—not lost in group chats.",
    ],
  },
  "newlands-cleaning-services": {
    slug: "newlands-cleaning-services",
    path: "/locations/newlands-cleaning-services",
    title: "Newlands Cleaning Cape Town | Families & Hosts | Shalean",
    description:
      "Newlands cleaning in Cape Town for family homes, townhouses, and village-adjacent homes. Deep, standard, and Airbnb cleaning—book Shalean online.",
    ogImage: "/images/marketing/shalean-cleaner-balcony-cape-town.webp",
    h1: "Newlands cleaning services in Cape Town for families, hosts, and village-adjacent homes",
    bookingLabel: "cleaning in Newlands",
    intro: [
      "Newlands combines tree-lined streets, village-style shopping, and easy access to the Southern Suburbs corridor—homes here often juggle school-week mess, weekend entertaining, and short-stay guests when families travel out of Cape Town.",
      "Shalean schedules vetted cleaners across Newlands with the same transparent quoting used citywide: bedrooms, bathrooms, extras, and service tier are locked in online before the team is dispatched.",
      "Hosts near the village strip often need home cleaning services Cape Town guests judge on photos first—flag balcony dust, linen resets, and tight check-in windows so professional cleaning services match your calendar.",
    ],
    localAngle: [
      "Hillside homes and split levels are common—mention stairs, parking bays, and any alarm protocols so Cape Town teams can plan equipment carry and timing.",
      "Short-stay hosts near the village should flag linen resets, balcony dust, and tight check-in windows so turnover cleans match guest expectations.",
    ],
    whyChoose: [
      "Guest-ready Airbnb cleans and dependable standard cycles for busy Newlands households.",
      "Cape Town-wide pricing logic with suburb-aware notes for access and pets.",
      "Support channel if something is missed—especially important before handovers or guest arrivals.",
    ],
  },
  "rosebank-cleaning-services": {
    slug: "rosebank-cleaning-services",
    path: "/locations/rosebank-cleaning-services",
    title: "Rosebank Cleaning Cape Town | Duplexes & Lets | Shalean",
    description:
      "Rosebank cleaning in Cape Town for student digs, duplexes, and homes near Rondebosch and Mowbray. Standard, deep, or move-out cleaning—book Shalean online.",
    ogImage: "/images/marketing/professional-cleaner-vacuum-bedroom-cape-town.webp",
    h1: "Rosebank cleaning services in Cape Town for students, duplexes, and rental corridors",
    bookingLabel: "cleaning in Rosebank",
    intro: [
      "Rosebank sits where Cape Town’s university-adjacent rentals meet quieter family streets—cleaning demand swings between fast bathroom and kitchen resets in shared flats and fuller home visits for multi-bedroom houses.",
      "Shalean supports Rosebank customers with metro-consistent online booking: choose rooms, bathrooms, extras, and intensity, then confirm pricing before checkout—ideal when flatmates or landlords need a shared paper trail.",
      "Duplex parking and split levels make access notes essential—pair clear gate guidance with the house cleaning Cape Town service tier you need so professional cleaning services arrive ready for Rosebank’s tighter streets.",
    ],
    localAngle: [
      "Split-level duplexes and narrow driveways are frequent—precise pins and parking guidance prevent delays on busy Cape Town arterials.",
      "Lease-end in shared lets often needs move-out scope plus oven or fridge extras—select those during quoting when Western Cape inventory lists require them.",
    ],
    whyChoose: [
      "Scoped visits so Rosebank flats are not quoted like large freestanding homes—and vice versa.",
      "Cleaners briefed for Cape Town rental realities: coastal dust, limescale, and high-use student kitchens.",
      "Card payment and email confirmation so agents, tenants, and flatmates stay aligned.",
    ],
  },
};

/** Short suburb label for keyword-rich cross-links (e.g. “Airbnb cleaning in Claremont”). */
export const LOCATION_SEO_SHORT_PLACE: Record<LocationSeoSlug, string> = {
  "claremont-cleaning-services": "Claremont",
  "wynberg-cleaning-services": "Wynberg",
  "rondebosch-cleaning-services": "Rondebosch",
  "kenilworth-cleaning-services": "Kenilworth",
  "observatory-cleaning-services": "Observatory",
  "newlands-cleaning-services": "Newlands",
  "rosebank-cleaning-services": "Rosebank",
};

const SERVICE_HUB_PHRASE: Record<CapeTownSeoServiceSlug, string> = {
  "deep-cleaning-cape-town": "Deep cleaning",
  "standard-cleaning-cape-town": "Standard cleaning",
  "move-out-cleaning-cape-town": "Move-out cleaning",
  "office-cleaning-cape-town": "Office cleaning",
  "airbnb-cleaning-cape-town": "Airbnb cleaning",
  "carpet-cleaning-cape-town": "Carpet cleaning",
};

/** Service SEO page → suburb hubs: “{Service} in Claremont” etc. */
export function serviceHubLocationLinks(serviceSlug: CapeTownSeoServiceSlug): { href: string; label: string }[] {
  const phrase = SERVICE_HUB_PHRASE[serviceSlug];
  return (Object.keys(LOCATION_SEO_SHORT_PLACE) as LocationSeoSlug[]).map((locSlug) => ({
    href: LOCATION_SEO_PAGES[locSlug].path,
    label: `${phrase} in ${LOCATION_SEO_SHORT_PLACE[locSlug]}`,
  }));
}

/**
 * Location SEO page → Cape Town-wide service URLs.
 * Anchors name the city (destination pages are /services/*-cape-town).
 */
export function locationHubServiceLinksCapeTownAnchors(): { href: string; label: string }[] {
  return [
    { href: CAPE_TOWN_SERVICE_SEO["deep-cleaning-cape-town"].path, label: "Deep cleaning in Cape Town" },
    { href: CAPE_TOWN_SERVICE_SEO["standard-cleaning-cape-town"].path, label: "Standard cleaning in Cape Town" },
    { href: CAPE_TOWN_SERVICE_SEO["move-out-cleaning-cape-town"].path, label: "Move-out cleaning in Cape Town" },
    { href: CAPE_TOWN_SERVICE_SEO["office-cleaning-cape-town"].path, label: "Office cleaning in Cape Town" },
    { href: CAPE_TOWN_SERVICE_SEO["airbnb-cleaning-cape-town"].path, label: "Airbnb cleaning in Cape Town" },
    { href: CAPE_TOWN_SERVICE_SEO["carpet-cleaning-cape-town"].path, label: "Carpet cleaning in Cape Town" },
  ];
}

export function getCapeTownServiceSeo(slug: string): CapeTownServiceSeoBlock | null {
  return CAPE_TOWN_SERVICE_SEO[slug as CapeTownSeoServiceSlug] ?? null;
}

export function getLocationSeo(slug: string): LocationSeoBlock | null {
  return LOCATION_SEO_PAGES[slug as LocationSeoSlug] ?? null;
}

export function buildCapeTownServiceMetadata(data: CapeTownServiceSeoBlock): Metadata {
  const url = `${SITE}${data.path}`;
  return {
    title: data.title,
    description: data.description,
    alternates: { canonical: data.path },
    openGraph: {
      type: "website",
      url,
      title: data.title,
      description: data.description,
      images: [{ url: data.ogImage, alt: data.h1 }],
    },
    twitter: {
      card: "summary_large_image",
      title: data.title,
      description: data.description,
      images: [data.ogImage],
    },
  };
}

export function buildLocationSeoMetadata(data: LocationSeoBlock): Metadata {
  const url = `${SITE}${data.path}`;
  return {
    title: data.title,
    description: data.description,
    alternates: { canonical: data.path },
    openGraph: {
      type: "website",
      url,
      title: data.title,
      description: data.description,
      images: [{ url: data.ogImage, alt: data.h1 }],
    },
    twitter: {
      card: "summary_large_image",
      title: data.title,
      description: data.description,
      images: [data.ogImage],
    },
  };
}

export function locationPageServiceLinks(): { href: string; label: string }[] {
  return [
    { href: CAPE_TOWN_SERVICE_SEO["deep-cleaning-cape-town"].path, label: "Deep cleaning Cape Town" },
    { href: CAPE_TOWN_SERVICE_SEO["standard-cleaning-cape-town"].path, label: "Standard cleaning Cape Town" },
    { href: CAPE_TOWN_SERVICE_SEO["move-out-cleaning-cape-town"].path, label: "Move-out cleaning Cape Town" },
    { href: CAPE_TOWN_SERVICE_SEO["office-cleaning-cape-town"].path, label: "Office cleaning Cape Town" },
    { href: CAPE_TOWN_SERVICE_SEO["airbnb-cleaning-cape-town"].path, label: "Airbnb cleaning Cape Town" },
    { href: CAPE_TOWN_SERVICE_SEO["carpet-cleaning-cape-town"].path, label: "Carpet cleaning Cape Town" },
  ];
}

export function capeTownSeoLocationLinks(): { href: string; label: string }[] {
  return (Object.keys(LOCATION_SEO_SHORT_PLACE) as LocationSeoSlug[]).map((locSlug) => ({
    href: LOCATION_SEO_PAGES[locSlug].path,
    label: `Cleaning services in ${LOCATION_SEO_SHORT_PLACE[locSlug]}`,
  }));
}

/** Screen-reader + crawler internal links from the marketing homepage (not visible). */
export const HOMEPAGE_INTERNAL_SEO_LINKS: { href: string; label: string }[] = (() => [
  { href: CAPE_TOWN_SERVICE_SEO["deep-cleaning-cape-town"].path, label: "Deep cleaning Cape Town" },
  { href: CAPE_TOWN_SERVICE_SEO["standard-cleaning-cape-town"].path, label: "Standard cleaning Cape Town" },
  { href: CAPE_TOWN_SERVICE_SEO["move-out-cleaning-cape-town"].path, label: "Move-out cleaning Cape Town" },
  { href: CAPE_TOWN_SERVICE_SEO["office-cleaning-cape-town"].path, label: "Office cleaning Cape Town" },
  { href: CAPE_TOWN_SERVICE_SEO["airbnb-cleaning-cape-town"].path, label: "Airbnb cleaning Cape Town" },
  { href: CAPE_TOWN_SERVICE_SEO["carpet-cleaning-cape-town"].path, label: "Carpet cleaning Cape Town" },
  ...capeTownSeoLocationLinks(),
])();
