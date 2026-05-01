import { randomUUID } from "node:crypto";
import type { BlogContentBlock, BlogContentJson, BlogInternalLinksBlock } from "@/lib/blog/content-json";
import { slugifyTitle } from "@/lib/blog/slugify-title";
import { getLocation, LOCATIONS } from "@/lib/locations";
import { CAPE_TOWN_SEO_SERVICE_SLUGS, locationSeoPathFromLegacyAreaSlug } from "@/lib/seo/capeTownSeoPages";

export type InjectInternalLinksContext = {
  location: string;
  city: string;
  service: string;
  locationSlug?: string;
  citySlug?: string;
  serviceSlug?: string;
  relatedBlogPosts?: { slug: string; title: string }[];
};

const MIN_LOCATION = 2;
const MIN_SERVICE = 2;
const MIN_BLOG = 2;

function normPath(u: string): string {
  try {
    const path = u.startsWith("http") ? new URL(u).pathname : u.split("?")[0] ?? u;
    return path.replace(/\/+$/, "") || "/";
  } catch {
    return u;
  }
}

function locationHref(locationAreaSlug: string): string {
  const path = locationSeoPathFromLegacyAreaSlug(locationAreaSlug);
  if (path) return path;
  const s = slugifyTitle(locationAreaSlug);
  return `/locations/${s}-cleaning-services`;
}

function primaryServicePath(serviceSlug: string, citySlug: string): string | null {
  if (citySlug === "cape-town") return `/services/${serviceSlug}-cape-town`;
  return null;
}

function collectInternalLinkUrls(blocks: BlogContentBlock[]): string[] {
  const urls: string[] = [];
  for (const b of blocks) {
    if (b.type === "internal_links") {
      for (const l of b.links) urls.push(normPath(l.url));
    }
  }
  return urls;
}

function countPrefix(urls: string[], prefix: string): number {
  return urls.filter((u) => u.startsWith(prefix)).length;
}

function countBlogPosts(urls: string[]): number {
  return urls.filter((u) => u.startsWith("/blog/") && u !== "/blog").length;
}

/** Deterministic anchor rotation per page + slot to reduce repetitive patterns across URLs. */
function anchorPick(options: string[], seed: string, slot: number): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return options[(h + slot) % options.length]!;
}

export function injectInternalLinks(
  content_json: BlogContentJson,
  context: InjectInternalLinksContext,
): BlogContentJson {
  const locationName = context.location.trim();
  const cityName = context.city.trim();
  const serviceName = context.service.trim();
  const locationSlug = (context.locationSlug ?? slugifyTitle(locationName)).replace(/^\/+|\/+$/g, "");
  const citySlug = (context.citySlug ?? slugifyTitle(cityName)).replace(/^\/+|\/+$/g, "");
  const serviceSlug = (context.serviceSlug ?? slugifyTitle(serviceName)).replace(/^\/+|\/+$/g, "");

  const existing = collectInternalLinkUrls(content_json.blocks);
  const simulated = [...existing];
  const toAdd: { label: string; url: string }[] = [];
  const seen = new Set(simulated);

  function push(label: string, url: string) {
    const p = normPath(url);
    if (seen.has(p)) return;
    seen.add(p);
    simulated.push(p);
    toAdd.push({ label, url: p });
  }

  const locPrimary = locationHref(locationSlug);
  const locRow = getLocation(locationSlug);
  const neighborSlug = locRow?.nearby?.[0];

  let locGuard = 0;
  while (countPrefix(simulated, "/locations") < MIN_LOCATION && locGuard++ < 8) {
    const n = countPrefix(simulated, "/locations");
    if (n === 0) {
      const locPrimaryAnchors = [
        `${serviceName} in ${locationName}`,
        `Book ${serviceName} (${locationName})`,
        `${locationName} ${serviceName} services`,
      ];
      push(anchorPick(locPrimaryAnchors, `${locationSlug}-${serviceSlug}-loc-a`, 0), locPrimary);
    } else if (neighborSlug) {
      const neighbor = getLocation(neighborSlug);
      const nName = neighbor?.name ?? neighborSlug;
      const neighborAnchors = [
        `Nearby area: ${nName}`,
        `Cleaning near ${locationName}: ${nName}`,
        `${nName} cleaning coverage`,
      ];
      push(anchorPick(neighborAnchors, `${locationSlug}-${neighborSlug}-loc-b`, 1), locationHref(neighborSlug));
    } else {
      const cityHub = LOCATIONS.find((l) => l.citySlug === citySlug && l.slug === l.citySlug);
      if (cityHub && cityHub.slug !== locationSlug) {
        const hubAnchors = [
          `${cityName} service area overview`,
          `Explore cleaning in ${cityName}`,
          `${locationName} & wider ${cityName} area`,
        ];
        push(anchorPick(hubAnchors, `${citySlug}-${locationSlug}-hub`, 2), locationHref(cityHub.slug));
      } else {
        break;
      }
    }
  }

  const svcPrimary = primaryServicePath(serviceSlug, citySlug);
  const alt = [...CAPE_TOWN_SEO_SERVICE_SLUGS].filter((s) => s !== `${serviceSlug}-cape-town`);
  const svcFallbackA = `/services/${alt[0] ?? "standard-cleaning-cape-town"}`;
  const svcFallbackB = `/services/${alt[1] ?? alt[0] ?? "deep-cleaning-cape-town"}`;

  let svcGuard = 0;
  while (countPrefix(simulated, "/services") < MIN_SERVICE && svcGuard++ < 8) {
    const n = countPrefix(simulated, "/services");
    if (n === 0 && svcPrimary) {
      const svcPrimaryAnchors = [
        `${serviceName} in ${cityName} (guide)`,
        `Shalean ${serviceName} — ${cityName}`,
        `View ${serviceName} checklist`,
      ];
      push(anchorPick(svcPrimaryAnchors, `${serviceSlug}-svc-a`, 0), svcPrimary);
    } else if (n === 0) {
      const fallbackAAnchors = [
        "Shalean service guide",
        `Browse ${serviceName}-style services`,
        "Compare Shalean service options",
      ];
      push(anchorPick(fallbackAAnchors, `${serviceSlug}-svc-fa`, 0), svcFallbackA);
    } else if (!seen.has(normPath(svcFallbackB))) {
      const altBAnchors = ["Related Shalean service", "Another service option", "See a related service guide"];
      push(anchorPick(altBAnchors, `${serviceSlug}-svc-b`, 1), svcFallbackB);
    } else if (!seen.has(normPath(svcFallbackA))) {
      const altAAnchors = ["Browse Shalean services", "More service guides", "Explore services"];
      push(anchorPick(altAAnchors, `${serviceSlug}-svc-c`, 2), svcFallbackA);
    } else break;
  }

  const related = (context.relatedBlogPosts ?? []).filter((p) => p.slug?.trim());
  const blogTarget = related.length >= MIN_BLOG ? MIN_BLOG : related.length;
  let ri = 0;
  while (countBlogPosts(simulated) < blogTarget && ri < related.length) {
    const p = related[ri]!;
    ri += 1;
    const shortTitle = p.title.slice(0, 88);
    const blogAnchors = [shortTitle, `Read: ${shortTitle}`, `${shortTitle} — tips`];
    push(anchorPick(blogAnchors, `${p.slug}-blog-${ri}`, ri), `/blog/${p.slug}`);
  }

  if (toAdd.length === 0) return content_json;

  const blocks = content_json.blocks.map((b) => ({ ...b })) as BlogContentBlock[];
  const idx = blocks.findIndex((b) => b.type === "internal_links");

  if (idx >= 0) {
    const cur = blocks[idx] as BlogInternalLinksBlock;
    const merged = [...cur.links];
    const mseen = new Set(merged.map((l) => normPath(l.url)));
    for (const l of toAdd) {
      const p = normPath(l.url);
      if (!mseen.has(p)) {
        mseen.add(p);
        merged.push({ label: l.label, url: l.url });
      }
    }
    blocks[idx] = { ...cur, links: merged };
  } else {
    blocks.push({
      id: randomUUID(),
      type: "internal_links",
      title: "Helpful links",
      links: toAdd,
    });
  }

  return { ...content_json, blocks };
}
