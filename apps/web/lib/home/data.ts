import { cache } from "react";
import type { HomeWidgetServiceKey } from "@/lib/pricing/calculatePrice";
import { pricingSlugForMarketingKey, MARKETING_TO_PRICING_SLUG } from "@/lib/marketing/marketingHomePricingSlugs";
import { HOME_STARTING_PRICE_ZAR } from "@/lib/seo/homePageMeta";
import { getSupabaseServer } from "@/lib/supabase/server";

type DbRow = Record<string, unknown>;

export type HomeService = {
  id: HomeWidgetServiceKey;
  title: string;
  description: string;
  price: number | null;
  badge: string | null;
  imageUrl: string | null;
  features: string[];
};

export type HomePricingTier = {
  id: string;
  title: string;
  description: string;
  price: number | null;
  cadence: string | null;
  features: string[];
};

export type HomeLocation = {
  id: string;
  name: string;
  city: string | null;
  slug: string | null;
};

export type HomeReview = {
  id: string;
  rating: number;
  quote: string;
  author: string | null;
};

export type HomeFaq = {
  id: string;
  question: string;
  answer: string;
};

export type HomePageData = {
  services: HomeService[];
  pricingTiers: HomePricingTier[];
  locations: HomeLocation[];
  reviews: HomeReview[];
  faqs: HomeFaq[];
};

const WIDGET_SERVICE_IDS = new Set<string>(["standard", "airbnb", "deep", "move", "carpet"]);

/** Homepage / JSON-LD service slugs — widget keys plus marketing-only lines (e.g. office). */
export const MARKETING_HOME_SERVICE_IDS = new Set<string>([...WIDGET_SERVICE_IDS, "office"]);

export type MarketingHomeServiceKey = HomeWidgetServiceKey | "office";

export type MarketingHomeService = {
  id: MarketingHomeServiceKey;
  title: string;
  description: string;
  price: number | null;
  badge: string | null;
  imageUrl: string | null;
  features: string[];
};

const MARKETING_SERVICE_KEY_BY_SLUG: Record<string, MarketingHomeServiceKey> = {
  standard: "standard",
  "standard-cleaning": "standard",
  "regular-cleaning": "standard",
  deep: "deep",
  "deep-cleaning": "deep",
  move: "move",
  move_cleaning: "move",
  "move-cleaning": "move",
  "moving-cleaning": "move",
  "move-in-out": "move",
  airbnb: "airbnb",
  "airbnb-cleaning": "airbnb",
  office: "office",
  "office-cleaning": "office",
  carpet: "carpet",
  "carpet-cleaning": "carpet",
};

function normalizeMarketingServiceKey(value: string | null): MarketingHomeServiceKey | null {
  if (!value) return null;
  return MARKETING_SERVICE_KEY_BY_SLUG[value] ?? null;
}

function text(row: DbRow, keys: string[]): string | null {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function numberValue(row: DbRow, keys: string[]): number | null {
  for (const key of keys) {
    const value = row[key];
    const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
    if (Number.isFinite(parsed)) return Math.round(parsed);
  }
  return null;
}

function listValue(row: DbRow, keys: string[]): string[] {
  for (const key of keys) {
    const value = row[key];
    if (Array.isArray(value)) {
      return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
    }
    if (typeof value === "string" && value.trim()) {
      return value
        .split(/\n|,/)
        .map((item) => item.trim())
        .filter(Boolean);
    }
  }
  return [];
}

function rowId(row: DbRow, fallback: string): string {
  return text(row, ["id", "slug", "key", "title", "name"]) ?? fallback;
}

function sortRows(rows: DbRow[]): DbRow[] {
  return [...rows].sort((a, b) => {
    const sortA = numberValue(a, ["sort_order", "display_order", "position"]) ?? Number.MAX_SAFE_INTEGER;
    const sortB = numberValue(b, ["sort_order", "display_order", "position"]) ?? Number.MAX_SAFE_INTEGER;
    if (sortA !== sortB) return sortA - sortB;
    return String(rowId(a, "")).localeCompare(String(rowId(b, "")));
  });
}

async function readRows(table: string): Promise<DbRow[]> {
  const supabase = getSupabaseServer();
  if (!supabase) return [];
  const { data, error } = await supabase.from(table).select("*");
  if (error) {
    console.error(`[home] ${table}:`, error.message);
    return [];
  }
  return Array.isArray(data) ? sortRows(data as DbRow[]) : [];
}

function mapMarketingHomeService(row: DbRow, _index: number): MarketingHomeService | null {
  const id = normalizeMarketingServiceKey(text(row, ["slug", "service_id", "id", "key"]));
  if (!id || !MARKETING_HOME_SERVICE_IDS.has(id)) return null;
  const title = text(row, ["title", "name", "label"]);
  const description = text(row, ["description", "summary", "short_description", "blurb"]);
  if (!title || !description) return null;
  return {
    id,
    title,
    description,
    price: null,
    badge: text(row, ["badge", "tagline", "eyebrow"]),
    imageUrl: text(row, ["image_url", "image", "photo_url"]),
    features: listValue(row, ["features", "bullets", "included"]),
  };
}

function activePricingBaseBySlug(rows: DbRow[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const row of rows) {
    if (row.is_active === false) continue;
    const slug = text(row, ["slug"]);
    const price = numberValue(row, ["base_price"]);
    if (slug && price != null) map.set(slug, price);
  }
  return map;
}

/**
 * Prevent the homepage SEO "from" price from silently diverging from the active homepage catalog.
 * CI/development fails when catalog data is available; production logs loudly instead of hiding drift.
 */
function guardHomepageStartingPriceContract(pricingRows: DbRow[]): void {
  const catalog = activePricingBaseBySlug(pricingRows);
  if (catalog.size === 0) return;

  const homepageSlugs = new Set(Object.values(MARKETING_TO_PRICING_SLUG));
  const activeHomepagePrices = [...catalog.entries()]
    .filter(([slug]) => homepageSlugs.has(slug))
    .map(([, price]) => price)
    .filter((price) => Number.isFinite(price) && price > 0);
  if (activeHomepagePrices.length === 0) return;

  const catalogMinimum = Math.min(...activeHomepagePrices);
  if (catalogMinimum === HOME_STARTING_PRICE_ZAR) return;

  const message = `[seo] Homepage starting-price contract is R${HOME_STARTING_PRICE_ZAR}, but the active homepage pricing catalog minimum is R${catalogMinimum}. Update the pricing authority and homepage SEO contract together.`;
  if (process.env.CI === "true" || process.env.NODE_ENV === "development") throw new Error(message);
  console.error(message);
}

/** Overlay checkout catalog base prices onto marketing service rows. */
function applyPricingCatalogToMarketingServices(
  services: MarketingHomeService[],
  pricingRows: DbRow[],
): MarketingHomeService[] {
  const catalog = activePricingBaseBySlug(pricingRows);
  if (catalog.size === 0) return services;

  return services.map((service) => {
    const catalogPrice = catalog.get(pricingSlugForMarketingKey(service.id));
    return catalogPrice != null ? { ...service, price: catalogPrice } : service;
  });
}

function mapService(row: DbRow, _index: number): HomeService | null {
  const id = normalizeMarketingServiceKey(text(row, ["slug", "service_id", "id", "key"]));
  if (!id || id === "office" || !WIDGET_SERVICE_IDS.has(id)) return null;
  const title = text(row, ["title", "name", "label"]);
  const description = text(row, ["description", "summary", "short_description", "blurb"]);
  if (!title || !description) return null;
  return {
    id: id as HomeWidgetServiceKey,
    title,
    description,
    price: numberValue(row, ["starting_price", "base_price", "price", "from_price"]),
    badge: text(row, ["badge", "tagline", "eyebrow"]),
    imageUrl: text(row, ["image_url", "image", "photo_url"]),
    features: listValue(row, ["features", "bullets", "included"]),
  };
}

function mapPricingTier(row: DbRow, index: number): HomePricingTier | null {
  const title = text(row, ["title", "name", "label"]);
  const description = text(row, ["description", "summary", "blurb"]);
  if (!title) return null;
  return {
    id: rowId(row, `pricing-${index}`),
    title,
    description: description ?? "",
    price: numberValue(row, ["price", "starting_price", "base_price", "amount"]),
    cadence: text(row, ["cadence", "unit", "billing_period", "price_suffix"]),
    features: listValue(row, ["features", "bullets", "included"]),
  };
}

function mapLocation(row: DbRow, index: number): HomeLocation | null {
  const name = text(row, ["name", "title", "area"]);
  if (!name) return null;
  return {
    id: rowId(row, `location-${index}`),
    name,
    city: text(row, ["city"]),
    slug: text(row, ["slug"]),
  };
}

function mapFaq(row: DbRow, index: number): HomeFaq | null {
  const question = text(row, ["question", "q", "title"]);
  const answer = text(row, ["answer", "a", "body", "content"]);
  if (!question || !answer) return null;
  return {
    id: rowId(row, `faq-${index}`),
    question,
    answer,
  };
}

export const getHomePageData = cache(async (): Promise<HomePageData> => {
  const [servicesRows, pricingTierRows, locationsRows, faqRows] = await Promise.all([
    readRows("services"),
    readRows("pricing_tiers"),
    readRows("locations"),
    readRows("faqs"),
  ]);

  return {
    services: servicesRows.map(mapService).filter((row): row is HomeService => Boolean(row)),
    pricingTiers: pricingTierRows.map(mapPricingTier).filter((row): row is HomePricingTier => Boolean(row)),
    locations: locationsRows.map(mapLocation).filter((row): row is HomeLocation => Boolean(row)).slice(0, 12),
    reviews: [],
    faqs: faqRows.map(mapFaq).filter((row): row is HomeFaq => Boolean(row)),
  };
});

/** Homepage SEO islands — skips unused `pricing_tiers` / reviews for faster TTFB. */
export const getMarketingHomeSeoData = cache(
  async (): Promise<Pick<HomePageData, "locations" | "faqs"> & { services: MarketingHomeService[] }> => {
    const [servicesRows, pricingRows, locationsRows, faqRows] = await Promise.all([
      readRows("services"),
      readRows("pricing_services"),
      readRows("locations"),
      readRows("faqs"),
    ]);

    guardHomepageStartingPriceContract(pricingRows);

    const services = applyPricingCatalogToMarketingServices(
      servicesRows.map(mapMarketingHomeService).filter((row): row is MarketingHomeService => Boolean(row)),
      pricingRows,
    );

    return {
      services,
      locations: locationsRows.map(mapLocation).filter((row): row is HomeLocation => Boolean(row)).slice(0, 12),
      faqs: faqRows.map(mapFaq).filter((row): row is HomeFaq => Boolean(row)),
    };
  },
);
