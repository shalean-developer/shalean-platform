import { randomUUID } from "node:crypto";
import { BLOG_CONTENT_JSON_SCHEMA_VERSION, type BlogContentBlock, type BlogContentJson } from "@/lib/blog/content-json";
import { enhanceFaq } from "@/lib/blog/seo/enhance-faq";
import { injectInternalLinks } from "@/lib/blog/seo/inject-internal-links";
import { optimizeMeta } from "@/lib/blog/seo/optimize-meta";
import { slugifyTitle } from "@/lib/blog/slugify-title";
import { locationSeoPathFromLegacyAreaSlug } from "@/lib/seo/capeTownSeoPages";
import { getLocation } from "@/lib/locations";

export type GenerateProgrammaticPostInput = {
  location: string;
  city: string;
  service: string;
  locationSlug?: string;
  citySlug?: string;
  serviceSlug?: string;
  relatedBlogPosts?: { slug: string; title: string }[];
};

export type ProgrammaticGeneratedPost = {
  title: string;
  slug: string;
  content_json: BlogContentJson;
  meta_title: string;
  meta_description: string;
  excerpt: string;
};

function bid(): string {
  return randomUUID();
}

function locationHref(locationAreaSlug: string): string {
  const path = locationSeoPathFromLegacyAreaSlug(locationAreaSlug);
  if (path) return path;
  const s = slugifyTitle(locationAreaSlug);
  return `/locations/${s}-cleaning-services`;
}

function serviceHref(serviceSlug: string, citySlug: string): string {
  if (citySlug === "cape-town") return `/services/${serviceSlug}-cape-town`;
  return "/booking";
}

export function generateProgrammaticPost(input: GenerateProgrammaticPostInput): ProgrammaticGeneratedPost {
  const locationName = input.location.trim();
  const cityName = input.city.trim();
  const serviceName = input.service.trim();
  const locationSlug = (input.locationSlug ?? slugifyTitle(locationName)).replace(/^\/+|\/+$/g, "");
  const citySlug = (input.citySlug ?? slugifyTitle(cityName)).replace(/^\/+|\/+$/g, "");
  const serviceSlug = (input.serviceSlug ?? slugifyTitle(serviceName)).replace(/^\/+|\/+$/g, "");
  const slug = `${serviceSlug}-${locationSlug}-${citySlug}`.slice(0, 120).replace(/-+$/g, "");

  const locRow = getLocation(locationSlug);
  const localHint = locRow?.localContext ?? `${locationName} homes and apartments`;
  const propertyHint = locRow?.propertyFocus ?? "local residences";

  const related = (input.relatedBlogPosts ?? [])
    .filter((p) => p.slug && p.slug !== slug)
    .slice(0, 3);

  const locPath = locationHref(locationSlug);
  const internalLinks: { label: string; url: string }[] = [];
  const seenUrl = new Set<string>();
  function addLink(label: string, url: string) {
    if (seenUrl.has(url)) return;
    seenUrl.add(url);
    internalLinks.push({ label, url });
  }
  addLink(`${serviceName} in ${locationName}`, locPath);
  addLink(`Book ${serviceName}`, "/booking");
  addLink("Cleaning guides & tips", "/blog");
  const svcPath = serviceHref(serviceSlug, citySlug);
  if (svcPath !== "/booking") {
    addLink(`${serviceName} in ${cityName} (service guide)`, svcPath);
  }
  for (const p of related) {
    addLink(p.title.slice(0, 80), `/blog/${p.slug}`);
  }

  const areaNames = new Set<string>([locationName]);
  if (locRow) {
    for (const n of locRow.nearby) {
      const neighbor = getLocation(n);
      if (neighbor) areaNames.add(neighbor.name);
      if (areaNames.size >= 8) break;
    }
  }

  const blocks: BlogContentBlock[] = [
    {
      id: bid(),
      type: "intro",
      content: `Looking for ${serviceName.toLowerCase()} in ${locationName}, ${cityName}? Shalean matches you with vetted cleaners who know ${localHint}. Share your address at booking so scope and timing fit ${propertyHint}.`,
    },
    {
      id: bid(),
      type: "quick_answer",
      content: `${serviceName} in ${locationName} covers kitchens, bathrooms, living areas, and floors using a structured checklist—ideal when you want a dependable reset without managing supplies or scheduling cleaners yourself.`,
    },
    {
      id: bid(),
      type: "section",
      title: `What ${serviceName.toLowerCase()} includes`,
      heading_level: 2,
      content: `${serviceName} focuses on high-touch surfaces, dust removal, floor care, and kitchen and bathroom hygiene. Teams adapt to your layout—whether compact apartments or larger family homes—while keeping communication clear before arrival.`,
    },
    {
      id: bid(),
      type: "section",
      title: `When ${locationName} households choose it`,
      heading_level: 2,
      content: `Choose this service when you are preparing for guests, recovering after a busy week, handling rental turnovers, or simply want recurring help in ${locationName}. ${localHint}`,
    },
    {
      id: bid(),
      type: "comparison_table",
      columns: ["Topic", "Shalean team", "Doing it yourself"],
      rows: [
        ["Time & scheduling", "Book online; vetted team arrives prepared.", "You source supplies and manage every hour."],
        ["Consistency", "Checklist-driven visit across rooms.", "Results vary week to week."],
        ["Local context", `Teams familiar with ${locationName} access and parking notes.`, "You interpret building rules alone."],
      ],
    },
    {
      id: bid(),
      type: "bullets",
      title: "Benefits",
      items: [
        `Clear scope for ${serviceName.toLowerCase()} before checkout`,
        `Vetted cleaners with Shalean standards in ${cityName}`,
        `Useful for ${propertyHint}`,
        `Straightforward rescheduling when plans change`,
      ],
    },
    {
      id: bid(),
      type: "internal_links",
      title: "Helpful next steps",
      links: internalLinks.slice(0, 8),
    },
    {
      id: bid(),
      type: "service_area",
      locations: [...areaNames],
    },
    {
      id: bid(),
      type: "faq",
      items: [
        {
          question: `Do you offer ${serviceName.toLowerCase()} in ${locationName}?`,
          answer: `Yes. Book online, add your ${locationName} address, and we confirm coverage and pricing before payment. Teams arrive with the agreed scope for ${cityName}.`,
        },
        {
          question: "How far in advance should I book?",
          answer:
            "Popular slots fill quickly—especially weekends. Booking a few days ahead improves availability; same-week requests may still work depending on your area.",
        },
        {
          question: "What if my home has pets or special instructions?",
          answer:
            "Add notes at checkout (pets, parking, alarms). Cleaners review instructions before arrival so the visit matches your expectations.",
        },
        {
          question: "Can I make this a recurring clean?",
          answer:
            "Yes. Choose recurring frequency where offered in booking, or start with a once-off and extend after your first visit.",
        },
      ],
    },
    {
      id: bid(),
      type: "cta",
      title: `Book ${serviceName} in ${locationName}`,
      button_text: "Check availability",
      link: "/booking",
      variant: "primary",
    },
  ];

  let content_json: BlogContentJson = {
    schema_version: BLOG_CONTENT_JSON_SCHEMA_VERSION,
    blocks,
  };

  content_json = injectInternalLinks(content_json, {
    location: locationName,
    city: cityName,
    service: serviceName,
    locationSlug,
    citySlug,
    serviceSlug,
    relatedBlogPosts: input.relatedBlogPosts,
  });

  content_json = enhanceFaq(content_json, {
    location: locationName,
    city: cityName,
    service: serviceName,
  });

  const titleBase = `${serviceName} in ${locationName}, ${cityName} | Shalean`;
  const meta_titleBase = `${serviceName} ${locationName} ${cityName} | Book online`;
  const meta_descriptionBase = `Book ${serviceName.toLowerCase()} in ${locationName}, ${cityName}. Vetted cleaners, clear scope, and simple online scheduling with Shalean.`;

  const metaOpt = optimizeMeta(
    { title: titleBase, meta_title: meta_titleBase, meta_description: meta_descriptionBase },
    { location: locationName, city: cityName, service: serviceName },
  );

  const excerpt = `Trusted ${serviceName.toLowerCase()} for ${locationName}—structured cleans, vetted teams, and easy booking in ${cityName}.`;

  return {
    title: metaOpt.title,
    slug,
    content_json,
    meta_title: metaOpt.meta_title,
    meta_description: metaOpt.meta_description,
    excerpt,
  };
}
