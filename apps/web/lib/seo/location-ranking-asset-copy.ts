import type { CapeTownLocationRow } from "@/lib/seo/capeTownLocations";
import type { LocationSeoBlock } from "@/lib/seo/capeTownSeoPages";
import { getLocationMetaPriceHint } from "@/lib/seo/location-pricing";
import { extractLeadPriceFromMetaHint } from "@/lib/seo/location-title-variants";

export type SpecialisedBullet = { title: string; body: string };

export type SpecialisedCareCopy = {
  heading: string;
  intro: string;
  bullets: SpecialisedBullet[];
  closing: string;
};

const SEA_POINT_SPECIALISED: SpecialisedCareCopy = {
  heading: "Why cleaning in Sea Point requires specialised care",
  intro:
    "Sea Point is one of Cape Town's busiest residential and Airbnb hubs. Properties here experience constant use, especially in holiday seasons. This means cleaning is not just about appearance — it's about speed, consistency, and attention to detail.",
  bullets: [
    {
      title: "Salt air buildup:",
      body: "Windows, glass, and surfaces collect residue quickly near the ocean.",
    },
    {
      title: "High Airbnb turnover:",
      body: "Same-day cleanings require fast, reliable teams.",
    },
    {
      title: "Apartment living:",
      body: "Smaller spaces need efficient, structured cleaning processes.",
    },
    {
      title: "Guest expectations:",
      body: "Cleanliness directly impacts reviews and bookings.",
    },
  ],
  closing:
    "We tailor our cleaning approach specifically for Sea Point homes and rentals to ensure every clean meets both residential and hospitality standards.",
};

/** Hero paragraphs when `rankingHeroIntro` is absent (high tier). */
export function buildDefaultRankingHeroIntro(row: CapeTownLocationRow, seo: LocationSeoBlock): string[] {
  const { name, city, region } = row;
  const airbnbPhrase =
    seo.hasAirbnbFocus !== false ? "home, Airbnb, and deep cleaning" : "home and deep cleaning";
  const lead =
    row.locationType === "coastal" || row.locationType === "blouberg"
      ? `salt air, lifts, and coastal wear shape realistic scope between visits`
      : row.locationType === "urban"
        ? `stairs, parking, and compact layouts mean access notes matter on every job`
        : `school-week calendars, pets, and busy kitchens shape what each visit needs to cover`;

  return [
    `Looking for reliable cleaning services in ${name}? Shalean Cleaning Services provides professional ${airbnbPhrase} across ${name} and the wider ${region}. Whether you rent, own, or manage guests, our vetted cleaners deliver consistent, scoped results tied to your online quote.`,
    `${name} properties sit in ${city} with real-world friction—${lead}. We brief crews for your address, rooms, and extras so totals stay honest before you confirm.`,
  ];
}

export function buildClaremontSpecialisedCare(name: string): SpecialisedCareCopy {
  return {
    heading: `Why cleaning in ${name} requires a different approach`,
    intro: `In ${name}, cleaning needs vary between student housing, family homes, and rentals. We tailor our approach to meet inspection standards, maintain consistency, and handle frequent tenant changes common in the area.`,
    bullets: [
      {
        title: "Student rentals & shared homes:",
        body: "Higher turnover and inspection standards.",
      },
      {
        title: "Family homes:",
        body: "Consistent weekly or bi-weekly maintenance.",
      },
      {
        title: "Townhouses & apartments:",
        body: "Compact spaces need detail-focused cleaning.",
      },
      {
        title: "End-of-tenancy:",
        body: "Agency-level checklists for deposit returns.",
      },
    ],
    closing: `Mention Cavendish-adjacent parking, school-week access, and rental inspection notes in your booking so ${name} crews budget time honestly.`,
  };
}

export function buildSpecialisedCareCopy(row: CapeTownLocationRow): SpecialisedCareCopy {
  if (row.slug === "sea-point-cleaning-services") {
    return SEA_POINT_SPECIALISED;
  }
  if (row.slug === "claremont-cleaning-services") {
    return buildClaremontSpecialisedCare(row.name);
  }

  const { name, region } = row;
  const t = new Set(row.propertyTypes);

  if (row.locationType === "coastal" || row.locationType === "blouberg") {
    return {
      heading: `Why cleaning in ${name} needs a Seaboard-ready approach`,
      intro: `${name} sits on ${region} where coastal grit, humidity, and busy corridors stack up fast—especially when calendars mix residents, guests, and weekend traffic.`,
      bullets: [
        {
          title: "Salt and wind residue:",
          body: `Glass rails, tracks, and balconies collect film quickly—scope honesty saves rushed turnovers.`,
        },
        {
          title: "Lift and parking choreography:",
          body: `Atlantic blocks vary intercom steps—notes in your booking keep crews moving.`,
        },
        {
          title: "Compact kitchens under pressure:",
          body: `High-use wet rooms need structured time—especially before inspections or guest photos.`,
        },
        {
          title: "Guest expectations:",
          body: t.has("short_stay")
            ? `Short-stay listings reward repeatable checklist quality between check-outs.`
            : `Households still expect hotel-fresh bathrooms after windy weeks.`,
        },
      ],
      closing: `We align visits to how ${name} homes actually live—coastal wear, access, and the intensity you select online.`,
    };
  }

  if (row.locationType === "urban") {
    return {
      heading: `Why cleaning in ${name} benefits from Bowl-smart planning`,
      intro: `${name} is dense ${region} living—stairs, buzzers, visitor parking, and compact flats mean crews win minutes when notes match reality.`,
      bullets: [
        {
          title: "Vertical logistics:",
          body: `Walk-ups and lifts change carry time—flag stairs or trolley rules early.`,
        },
        {
          title: "Dust and footfall:",
          body: `City Bowl streets push grit indoors fast—vacuum edges matter on scoped visits.`,
        },
        {
          title: "Noise-sensitive neighbours:",
          body: `Scoped timing respects blocks where acoustics travel.`,
        },
        {
          title: "Kitchens that multitask:",
          body: `Compact layouts concentrate grease and limescale—deep tiers exist when needed.`,
        },
      ],
      closing: `Book with ${name}-specific access detail so ${region} routing stays predictable.`,
    };
  }

  if (row.locationType === "estate") {
    return {
      heading: `Why cleaning in ${name} scales with honest scope`,
      intro: `${name} mixes larger footprints with entertaining zones—floors, kitchens, and bathrooms need proportional time, especially before guests or handovers.`,
      bullets: [
        {
          title: "Plot size vs calendar:",
          body: `More bathrooms and passages multiply mop cycles—match intensity online.`,
        },
        {
          title: "Outdoor-adjacent dust:",
          body: `Trees and breeze paths push pollen—mention patios when they matter.`,
        },
        {
          title: "Pet + family traffic:",
          body: `Homes with pets need vacuum realism on recurring visits.`,
        },
        {
          title: "Guests and listings:",
          body: t.has("short_stay")
            ? `Turnovers still need checklist parity with gallery photos.`
            : `Deep resets help before hosting weekends.`,
        },
      ],
      closing: `We scope ${name} visits for real layouts—not generic studio defaults.`,
    };
  }

  return {
    heading: `Why cleaning in ${name} needs suburb-aware detail`,
    intro: `${name} blends ${region} streets where school runs, rentals, and family traffic keep kitchens and bathrooms busy between professional visits.`,
    bullets: [
      {
        title: "Access and parking:",
        body: `Driveways and gates differ house-to-house—pins save circling.`,
      },
      {
        title: "Leaf litter and pets:",
        body: `Garden-adjacent dust shows up on skirting—tell us about fur-friendly floors.`,
      },
      {
        title: "Student and rental mixes:",
        body: t.has("student_share")
          ? `Shared bathrooms mean higher wipe cadence—choose tiers honestly.`
          : `Rentals still face inspection-style scrutiny on handovers.`,
      },
      {
        title: "Kitchen intensity:",
        body: `Weeknight cooking loads ovens and sinks—deep visits recover baseline sparkle.`,
      },
    ],
    closing: `Shalean crews brief around ${name} realities so your locked quote matches the home we service.`,
  };
}

export function buildApartmentsModuleHeading(name: string): string {
  return `Cleaning for ${name} apartments and rentals`;
}

/** Apartments + rentals body (high tier); medium tier uses shorter variant in component. */
export function buildApartmentsModuleLead(row: CapeTownLocationRow, seo: LocationSeoBlock): string {
  const { name } = row;
  const t = new Set(row.propertyTypes);
  if (t.has("short_stay") && seo.hasAirbnbFocus !== false) {
    return `Most high-demand bookings in ${name} combine compact apartments with short-stay turnover—crews focus on wet rooms, floors, and guest-visible detail without wasting minutes on scope drift.`;
  }
  if (t.has("apartment")) {
    return `${name} skews toward apartments and tighter floor plans—structured cleans respect lifts, noise, and efficient movement while still resetting kitchens and bathrooms properly.`;
  }
  return `${name} mixes apartments and houses across ${row.region}—we scope honestly for your layout so bedrooms, bathrooms, and living zones get proportional time.`;
}

export function buildNearMeParagraph(row: CapeTownLocationRow): string {
  const { name, city } = row;
  return `If you’re searching for cleaning services near you in ${name}, our local cleaners are available for same-day and scheduled bookings when routing allows—lock scope online so crews arrive briefed for lifts, parking, and your exact ${city} address.`;
}

export function pricingLeadFromRow(row: CapeTownLocationRow): string {
  return extractLeadPriceFromMetaHint(getLocationMetaPriceHint(row));
}

export function buildCostFaqAnswer(row: CapeTownLocationRow): string {
  const { name } = row;
  const lead = pricingLeadFromRow(row);
  return `Cleaning services in ${name} typically start from around ${lead} depending on the size of the property and the type of service required. Airbnb and deep cleaning services may cost more based on turnaround time and level of detail.`;
}

export function buildTrustBulletLines(name: string): string[] {
  return [
    `Trusted by homeowners and hosts booking recurring visits in ${name}`,
    "Vetted, experienced cleaners with structured checklists",
    "Flexible booking and fast turnaround when calendars open",
    "Transparent pricing with no surprise surcharges for the scope you select",
  ];
}
