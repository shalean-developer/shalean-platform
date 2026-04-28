import { cache } from "react";
import type { HomeWidgetServiceKey } from "@/lib/pricing/calculatePrice";
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

function mapService(row: DbRow, index: number): HomeService | null {
  const rawId = text(row, ["slug", "service_id", "id", "key"]);
  const id = rawId === "move_cleaning" || rawId === "move-in-out" ? "move" : rawId;
  if (!id || !WIDGET_SERVICE_IDS.has(id)) return null;
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
