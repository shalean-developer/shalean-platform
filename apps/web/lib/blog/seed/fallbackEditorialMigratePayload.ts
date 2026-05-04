import type { BlogContentJson } from "@/lib/blog/content-json";
import type { BlogPostSlug } from "@/lib/blog/posts";
import { BLOG_POSTS, LEGACY_EDITORIAL_SLUGS } from "@/lib/blog/posts";
import { BLOG_CONTENT_JSON_SCHEMA_VERSION } from "@/lib/blog/content-json";
import { FALLBACK_EDITORIAL_HTML } from "@/lib/blog/seed/fallbackEditorialHtml";

function buildContentJson(slug: BlogPostSlug, html: string): BlogContentJson {
  const meta = BLOG_POSTS[slug];
  const blocks: BlogContentJson["blocks"] = [
    { type: "intro", content: meta.excerpt },
    { type: "rich_text", html },
  ];

  if (slug === "deep-vs-standard-cleaning-cape-town") {
    blocks.push({
      type: "faq",
      items: [
        {
          question: "Is deep cleaning always better than standard cleaning in Cape Town?",
          answer:
            "No. Deep cleaning spends more time on detail zones; if your home is already on a steady maintenance schedule, you may be paying for intensity you do not need every visit. Use deep cleaning when build-up, events, or inspections justify the extra hours.",
        },
        {
          question: "How do I know if my bathroom needs deep work?",
          answer:
            "Look for fixed limescale around taps, grout that has darkened unevenly, or silicone edges that no longer respond to a quick wipe. Those signals usually mean a deep pass—or targeted add-ons—rather than a standard baseline clean alone.",
        },
        {
          question: "Can I book standard cleaning and add oven or fridge extras?",
          answer:
            "Often yes—select add-ons during quoting so the team brings enough time. If multiple heavy extras stack up, your booking may behave closer to a deep visit; the booking flow is designed to surface that before payment.",
        },
        {
          question: "Does Airbnb cleaning replace standard cleaning for my own home?",
          answer:
            "Not necessarily. Airbnb turnover cleaning optimises for guest changeovers. If you also live in the property, keep a separate rhythm for the spaces you use daily, and use the Airbnb cleaning Cape Town guide when the priority is the next guest's experience.",
        },
        {
          question: "How far ahead should I book in peak Cape Town season?",
          answer:
            "Holiday and summer weeks fill faster. Booking as soon as you know dates—especially for deep resets or move-adjacent work—reduces stress and keeps more slot choices open without paying rush fees that some markets introduce.",
        },
      ],
    });
  }

  if (slug === "cleaning-cost-cape-town") {
    blocks.push({
      type: "faq",
      items: [
        {
          question: "How much does a cleaner cost per hour in Cape Town?",
          answer:
            "Rates vary, but most professional services charge based on the job rather than hourly, typically ranging between R250–R500 depending on the service.",
        },
        {
          question: "Is deep cleaning worth the extra cost?",
          answer:
            "Yes—especially if your home hasn't been cleaned thoroughly in a while. It provides a more complete and long-lasting result.",
        },
        {
          question: "How can I get an exact cleaning quote?",
          answer:
            "The easiest way is to use our booking system, where you can select your home details and see pricing instantly.",
        },
        {
          question: "Are cleaning supplies included?",
          answer:
            "Yes, professional cleaning services usually include all necessary supplies unless stated otherwise.",
        },
      ],
    });
  }

  if (slug === "airbnb-cleaning-checklist") {
    blocks.push({
      type: "faq",
      items: [
        {
          question: "How long does Airbnb cleaning take?",
          answer:
            "It varies with bedrooms, bathrooms, linen handling, and whether you add extras like inside-fridge or balcony deep cleans. A compact one-bedroom may need less time than a multi-level family home with several wet areas. Build your scope honestly so the visit length matches the job.",
        },
        {
          question: "Do cleaners change linen?",
          answer:
            "Many turnovers include linen changes if you supply clean sets and clear staging instructions. Confirm what you want stripped, bagged, and remade—and where fresh linen lives—so nothing is guessed on the day.",
        },
        {
          question: "Can I book same-day cleaning?",
          answer:
            "Often yes when capacity and your gap between guests allow. Early booking improves odds, especially on weekends and holidays when Cape Town short-stay demand peaks.",
        },
        {
          question: "How much does Airbnb cleaning cost in Cape Town?",
          answer:
            "Pricing reflects home size, bathrooms, extras, and timing. The fairest approach is an itemised quote tied to room counts and add-ons—so you are not paying for deep detail when you only need a tight turnover reset.",
        },
        {
          question: "Is turnover cleaning different from a regular house clean?",
          answer:
            "Yes. Turnover cleaning optimises for guest arrival, photos, and reviews; regular cleaning optimises for ongoing maintenance between visits. Use the right checklist for each so neither is under-scoped.",
        },
      ],
    });
  }

  return {
    schema_version: BLOG_CONTENT_JSON_SCHEMA_VERSION,
    blocks,
  };
}

export type FallbackEditorialMigrateSeed = {
  slug: BlogPostSlug;
  title: string;
  h1: string;
  excerpt: string;
  meta_title: string;
  meta_description: string;
  featured_image_url: string;
  featured_image_alt: string;
  primary_keyword: string | null;
  secondary_keywords: string[];
  search_intent: string;
  content_json: BlogContentJson;
};

function secondaryFromMeta(slug: BlogPostSlug): string[] {
  const related = BLOG_POSTS[slug].relatedSlugs;
  return related.map((s) => s.replace(/-/g, " "));
}

export const FALLBACK_EDITORIAL_MIGRATE_SEEDS: FallbackEditorialMigrateSeed[] = LEGACY_EDITORIAL_SLUGS.map(
  (slug) => {
    const meta = BLOG_POSTS[slug];
    const html = FALLBACK_EDITORIAL_HTML[slug];
    if (!html) throw new Error(`Missing FALLBACK_EDITORIAL_HTML for ${slug}`);
    return {
      slug,
      title: meta.title,
      h1: meta.title,
      excerpt: meta.excerpt,
      meta_title: meta.title,
      meta_description: meta.description,
      featured_image_url: meta.heroImage.src.startsWith("/") ? meta.heroImage.src : `/${meta.heroImage.src}`,
      featured_image_alt: meta.heroImage.alt,
      primary_keyword: meta.title.split(":")[0]?.trim() ?? meta.title,
      secondary_keywords: secondaryFromMeta(slug),
      search_intent: "informational",
      content_json: buildContentJson(slug, html),
    };
  },
);
