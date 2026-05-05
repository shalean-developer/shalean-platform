import type { BlogContentBlock, BlogImageBlock } from "@/lib/blog/content-json";

/**
 * Location-hub SEO images: filenames follow `cleaning-services-{location}-{context}.webp`
 * (WebP for performance; swap to `.jpg` only if you add true JPEG assets).
 */

/** DB slugs that receive injected illustration blocks (filenames + alt locality). */
export const LOCATION_HUB_SEO_IMAGE_SLUGS = new Set([
  "cleaning-services-claremont-cape-town",
  "cleaning-services-sea-point-cape-town",
  "cleaning-services-rondebosch-cape-town",
  "cleaning-services-gardens-cape-town",
  "cleaning-services-wynberg-cape-town",
  "cleaning-services-green-point-cape-town",
  "cleaning-services-durbanville-cape-town",
]);

const DISPLAY_IMAGE_WIDTH = 1200;
const DISPLAY_IMAGE_HEIGHT = 750;

function slugToLocationPathSegment(slug: string): string | null {
  const m = /^cleaning-services-(.+)-cape-town$/.exec(slug);
  return m ? m[1] : null;
}

/** Title case for alt text, e.g. sea-point → Sea Point */
export function hubSlugToDisplayLocation(slug: string): string | null {
  const seg = slugToLocationPathSegment(slug);
  if (!seg) return null;
  return seg
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function isServiceSectionHeading(content: string): boolean {
  return (
    /what your booking covers/i.test(content) ||
    /what each cleaning tier delivers/i.test(content) ||
    /services mapped to real/i.test(content) ||
    /what we actually clean/i.test(content) ||
    /what each service line solves/i.test(content) ||
    /service stack tuned/i.test(content) ||
    /services sized for bigger/i.test(content)
  );
}

/** Index of the service bullet_list block (end anchor: insert image after this block). */
function findServiceBulletListIndex(blocks: BlogContentBlock[]): number {
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (b.type !== "heading") continue;
    if (!isServiceSectionHeading(b.content)) continue;
    for (let j = i + 1; j < blocks.length; j++) {
      if (blocks[j].type === "bullet_list") return j;
    }
  }
  return -1;
}

/** Index of the paragraph immediately following the main “When …” H2. */
function findWhenParagraphIndex(blocks: BlogContentBlock[]): number {
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (b.type !== "heading") continue;
    if (!/^when\b/i.test(b.content.trim())) continue;
    for (let j = i + 1; j < blocks.length; j++) {
      const t = blocks[j].type;
      if (t === "paragraph" || t === "rich_text") return j;
    }
  }
  return -1;
}

function buildHubImageBlocks(slug: string): [BlogImageBlock, BlogImageBlock, BlogImageBlock] | null {
  const locPath = slugToLocationPathSegment(slug);
  const locTitle = hubSlugToDisplayLocation(slug);
  if (!locPath || !locTitle) return null;

  const base = `/images/blog/hubs/cleaning-services-${locPath}`;

  return [
    {
      type: "image",
      id: `${slug}-seo-services`,
      url: `${base}-deep-kitchen.webp`,
      alt: `Deep cleaning kitchen in ${locTitle} Cape Town`,
      width: DISPLAY_IMAGE_WIDTH,
      height: DISPLAY_IMAGE_HEIGHT,
    },
    {
      type: "image",
      id: `${slug}-seo-when`,
      url: `${base}-living-room.webp`,
      alt: `Standard cleaning home in ${locTitle} Cape Town`,
      width: DISPLAY_IMAGE_WIDTH,
      height: DISPLAY_IMAGE_HEIGHT,
    },
    {
      type: "image",
      id: `${slug}-seo-pre-cta`,
      url: `${base}-professional-clean.webp`,
      alt: `Professional house cleaning in ${locTitle} Cape Town`,
      width: DISPLAY_IMAGE_WIDTH,
      height: DISPLAY_IMAGE_HEIGHT,
    },
  ];
}

/**
 * Inserts three SEO illustration blocks for location hub posts:
 * after services bullet_list, after “when” paragraph, immediately before CTA.
 */
export function injectLocationHubSeoImages(slug: string, blocks: BlogContentBlock[]): BlogContentBlock[] {
  const safe = Array.isArray(blocks) ? blocks : [];
  if (!LOCATION_HUB_SEO_IMAGE_SLUGS.has(slug)) return safe;

  const imgs = buildHubImageBlocks(slug);
  if (!imgs) return safe;

  const servicesIdx = findServiceBulletListIndex(safe);
  const whenParaIdx = findWhenParagraphIndex(safe);
  const ctaIdx = safe.findIndex((b) => b.type === "cta");

  if (servicesIdx === -1 || whenParaIdx === -1 || ctaIdx <= 0) return safe;

  const [imgServices, imgWhen, imgPreCta] = imgs;
  const out: BlogContentBlock[] = [];

  for (let i = 0; i < safe.length; i++) {
    out.push(safe[i]);
    if (i === servicesIdx) out.push(imgServices);
    if (i === whenParaIdx) out.push(imgWhen);
    if (i === ctaIdx - 1) out.push(imgPreCta);
  }

  return out;
}
