/**
 * One-off: build INSERT migration from supabase/seed/update_blog_posts_location_hubs_content_json.sql
 * Usage: node tools/gen-editorial-migration.js <slug> <migrationBasename>
 * Ensures trailing comma after content_json ::jsonb (VALUES list).
 */
const fs = require("fs");

const slug = process.argv[2];
const outBase = process.argv[3];
if (!slug || !outBase) {
  console.error("Usage: node tools/gen-editorial-migration.js <slug> <outBasename e.g. 20260893_blog_deep_cleaning_gardens>");
  process.exit(1);
}

const seedPath = "supabase/seed/update_blog_posts_location_hubs_content_json.sql";
const t = fs.readFileSync(seedPath, "utf8");
const needle = `WHERE slug = '${slug}'`;
const i = t.indexOf(needle);
if (i < 0) throw new Error(`slug ${slug} not found in ${seedPath}`);
const slice = t.slice(0, i);
const li = slice.lastIndexOf("SET content_json = ");
const frag = slice.slice(li + "SET content_json = ".length);
const j = frag.indexOf("::jsonb");
const jsonExpr = frag.slice(0, j + "::jsonb".length).trim();

const publishedAtBySlug = {
  "luxury-home-cleaning-camps-bay-cape-town": "2026-05-04 11:00:00+02",
  "regular-home-cleaning-wynberg-cape-town": "2026-05-04 12:00:00+02",
  "affordable-cleaning-observatory-cape-town": "2026-05-04 13:00:00+02",
  "home-cleaning-plumstead-cape-town": "2026-05-04 14:00:00+02",
  "home-cleaning-constantia-cape-town": "2026-05-04 15:00:00+02",
};

const meta = {
  "home-cleaning-constantia-cape-town": {
    title: "Home Cleaning in Constantia Cape Town: Large Homes, Pricing & What's Included",
    h1: "Home Cleaning in Constantia Cape Town: Large Homes, Pricing & What's Included",
    excerpt:
      "Home cleaning in Constantia for large homes and estates—pricing from around R500–R1200, structured visits, deep and standard options, and how to book.",
    meta_title: "Home Cleaning Constantia Cape Town | Large Homes | Shalean Blog",
    meta_description:
      "Home cleaning in Constantia: large homes and estates, pricing from around R500–R1200, standard and deep cleaning, same-day when scheduling allows. Book online.",
    primary_keyword: "home cleaning constantia cape town",
    featured_image_url: "/images/marketing/house-deep-cleaning-cape-town.webp",
    featured_image_alt: "Professional home cleaning in a large Constantia, Cape Town property",
    comment:
      "Constantia premium large-home editorial guide (published). Sync body with apps/web/lib/blog/seed/locationHubStructuredContent.ts.",
  },
  "home-cleaning-plumstead-cape-town": {
    title: "Home Cleaning in Plumstead Cape Town: Regular Maintenance, Pricing & What's Included",
    h1: "Home Cleaning in Plumstead Cape Town: Regular Maintenance, Pricing & What's Included",
    excerpt:
      "Home cleaning in Plumstead for family homes—regular maintenance, pricing from around R250–R450, weekly and bi-weekly options, and what’s included.",
    meta_title: "Home Cleaning Plumstead Cape Town | Maintenance | Shalean Blog",
    meta_description:
      "Home cleaning in Plumstead: quiet suburban maintenance cleans, pricing from around R250–R450, standard and deep options, same-day when scheduling allows. Book online.",
    primary_keyword: "home cleaning plumstead cape town",
    featured_image_url: "/images/marketing/house-deep-cleaning-cape-town.webp",
    featured_image_alt: "Regular home cleaning in a Plumstead, Cape Town family house",
    comment:
      "Plumstead family / maintenance editorial guide (published). Sync body with apps/web/lib/blog/seed/locationHubStructuredContent.ts.",
  },
  "affordable-cleaning-observatory-cape-town": {
    title: "Affordable Cleaning in Observatory Cape Town: Shared Homes, Pricing & What's Included",
    h1: "Affordable Cleaning in Observatory Cape Town: Shared Homes, Pricing & What's Included",
    excerpt:
      "Affordable cleaning in Observatory for shared homes and student flats—pricing from around R200–R400, flexible schedules, splitting costs with flatmates, and how to book.",
    meta_title: "Affordable Cleaning Observatory Cape Town | Shared Homes | Shalean Blog",
    meta_description:
      "Affordable cleaning in Observatory: shared houses and student accommodation, pricing from around R200–R400, standard and deep options, same-day when scheduling allows. Book online.",
    primary_keyword: "affordable cleaning observatory cape town",
    featured_image_url: "/images/marketing/cleaning-team-bright-space-cape-town.webp",
    featured_image_alt: "Professional cleaners preparing a shared home in Observatory, Cape Town",
    comment:
      "Observatory affordable / shared-home editorial guide (published). Sync body with apps/web/lib/blog/seed/locationHubStructuredContent.ts.",
  },
  "regular-home-cleaning-wynberg-cape-town": {
    title: "Regular Home Cleaning in Wynberg Cape Town: Weekly Plans, Pricing & What's Included",
    h1: "Regular Home Cleaning in Wynberg Cape Town: Weekly Plans, Pricing & What's Included",
    excerpt:
      "Regular home cleaning in Wynberg for busy families—weekly and bi-weekly plans, pricing from around R250–R450, what’s included, and how to book.",
    meta_title: "Regular Home Cleaning Wynberg Cape Town | Weekly | Shalean Blog",
    meta_description:
      "Regular cleaning in Wynberg: weekly and bi-weekly home maintenance for families, pricing from around R250–R450, standard and deep options, same-day when scheduling allows. Book online.",
    primary_keyword: "regular home cleaning wynberg cape town",
    featured_image_url: "/images/marketing/bright-living-room-after-cleaning-cape-town.webp",
    featured_image_alt: "Bright family living space after a regular home clean in Wynberg, Cape Town",
    comment:
      "Wynberg regular / recurring editorial guide (published). Sync body with apps/web/lib/blog/seed/locationHubStructuredContent.ts.",
  },
  "luxury-home-cleaning-camps-bay-cape-town": {
    title: "Luxury Home Cleaning in Camps Bay: Premium Service, Pricing & What's Included",
    h1: "Luxury Home Cleaning in Camps Bay: Premium Service, Pricing & What's Included",
    excerpt:
      "Luxury home cleaning in Camps Bay for premium finishes and large Seaboard homes—what’s included, pricing from around R500–R1200+, same-day when available, and how to book.",
    meta_title: "Luxury Home Cleaning Camps Bay Cape Town | Premium | Shalean Blog",
    meta_description:
      "Luxury cleaning in Camps Bay: premium homes and sea-facing apartments, pricing from around R500–R1200+, deep and standard options, same-day when scheduling allows. Book online.",
    primary_keyword: "luxury home cleaning camps bay cape town",
    featured_image_url: "/images/marketing/professional-cleaner-vacuum-bedroom-cape-town.webp",
    featured_image_alt: "Professional cleaner preparing a luxury Camps Bay living space",
    comment:
      "Camps Bay premium / luxury-home editorial guide (published). Sync body with apps/web/lib/blog/seed/locationHubStructuredContent.ts.",
  },
  "deep-cleaning-gardens-cape-town": {
    title: "Deep Cleaning in Gardens Cape Town: Once-Off Cleaning, Pricing & What's Included",
    h1: "Deep Cleaning in Gardens Cape Town: Once-Off Cleaning, Pricing & What's Included",
    excerpt:
      "Deep cleaning in Gardens for family homes and older properties—once-off resets, pricing from around R800–R1500, same-day options when available, and what’s included.",
    meta_title: "Deep Cleaning Gardens Cape Town | Once-Off | Shalean Blog",
    meta_description:
      "Deep cleaning in Gardens: once-off and detailed resets for family homes and apartments, pricing from around R800–R1500, same-day when scheduling allows. Book online.",
    primary_keyword: "deep cleaning gardens cape town",
    featured_image_url: "/images/marketing/deep-cleaning-cape-town-kitchen.webp",
    featured_image_alt: "Professional deep cleaning in a Gardens, Cape Town home kitchen",
    comment: "Gardens once-off / deep editorial guide (published). Sync body with apps/web/lib/blog/seed/locationHubStructuredContent.ts.",
  },
};

const m = meta[slug];
if (!m) throw new Error(`Add meta for slug ${slug} in tools/gen-editorial-migration.js`);

function sqlStr(s) {
  return `'${s.replace(/'/g, "''")}'`;
}

const sql = `-- ${m.comment}

INSERT INTO public.blog_posts (
  slug,
  title,
  h1,
  excerpt,
  status,
  source,
  content_json,
  meta_title,
  meta_description,
  primary_keyword,
  search_intent,
  featured_image_url,
  featured_image_alt,
  published_at,
  created_at,
  updated_at
)
VALUES (
  ${sqlStr(slug)},
  ${sqlStr(m.title)},
  ${sqlStr(m.h1)},
  ${sqlStr(m.excerpt)},
  'published'::public.blog_post_status,
  'programmatic'::public.blog_post_source,
  ${jsonExpr},
  ${sqlStr(m.meta_title)},
  ${sqlStr(m.meta_description)},
  ${sqlStr(m.primary_keyword)},
  'transactional',
  ${sqlStr(m.featured_image_url)},
  ${sqlStr(m.featured_image_alt)},
  timestamptz '${publishedAtBySlug[slug] ?? "2026-05-04 10:00:00+02"}',
  now(),
  now()
)
ON CONFLICT (slug) DO UPDATE SET
  title = EXCLUDED.title,
  h1 = EXCLUDED.h1,
  excerpt = EXCLUDED.excerpt,
  status = EXCLUDED.status,
  source = EXCLUDED.source,
  content_json = EXCLUDED.content_json,
  meta_title = EXCLUDED.meta_title,
  meta_description = EXCLUDED.meta_description,
  primary_keyword = EXCLUDED.primary_keyword,
  search_intent = EXCLUDED.search_intent,
  featured_image_url = EXCLUDED.featured_image_url,
  featured_image_alt = EXCLUDED.featured_image_alt,
  published_at = EXCLUDED.published_at,
  updated_at = now();
`;

const outPath = `supabase/migrations/${outBase}.sql`;
fs.writeFileSync(outPath, sql);
console.log("Wrote", outPath);
