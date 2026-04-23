import type { BookingServiceId } from "@/components/booking/serviceCategories";
import type { ServiceTariff } from "@/lib/pricing/pricingConfig";

const SERVICE_KEYS: readonly BookingServiceId[] = [
  "quick",
  "standard",
  "airbnb",
  "deep",
  "carpet",
  "move",
];

export type SnapshotExtraRow = {
  price: number;
  services: BookingServiceId[];
  name?: string;
  description?: string;
  isPopular?: boolean;
};

export type SnapshotBundleRow = {
  id: string;
  items: string[];
  price: number;
  services?: BookingServiceId[];
  label?: string;
  blurb?: string;
};

export type PricingRatesSnapshot = {
  /** Tariff marker stored in signed quotes (`CheckoutQuoteResult.pricingVersion`). */
  codeVersion: number;
  services: Record<BookingServiceId, ServiceTariff>;
  extras: Record<string, SnapshotExtraRow>;
  bundles: SnapshotBundleRow[];
};

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((x) => stableStringify(x)).join(",")}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(",")}}`;
}

export { stableStringify };

function isServiceTariff(v: unknown): v is ServiceTariff {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  const dur = o.duration;
  if (!dur || typeof dur !== "object") return false;
  const d = dur as Record<string, unknown>;
  return (
    typeof o.base === "number" &&
    typeof o.bedroom === "number" &&
    typeof o.bathroom === "number" &&
    typeof o.extraRoom === "number" &&
    typeof d.base === "number" &&
    typeof d.bedroom === "number" &&
    typeof d.bathroom === "number" &&
    typeof d.extraRoom === "number"
  );
}

function parseBundles(raw: unknown): SnapshotBundleRow[] {
  if (!raw || typeof raw !== "object") return [];
  const rules = raw as Record<string, unknown>;
  const b = rules.bundles;
  if (!Array.isArray(b)) return [];
  const out: SnapshotBundleRow[] = [];
  for (const row of b) {
    if (!row || typeof row !== "object") continue;
    const o = row as Record<string, unknown>;
    const id = typeof o.id === "string" ? o.id.trim() : "";
    const price = typeof o.price === "number" && Number.isFinite(o.price) ? Math.round(o.price) : NaN;
    const items = Array.isArray(o.items)
      ? o.items.filter((x): x is string => typeof x === "string" && x.trim().length > 0)
      : [];
    if (!id || !Number.isFinite(price) || items.length === 0) continue;
    const label = typeof o.label === "string" && o.label.trim() ? o.label.trim() : undefined;
    const blurb = typeof o.blurb === "string" && o.blurb.trim() ? o.blurb.trim() : undefined;
    const servicesRaw = o.services;
    let services: BookingServiceId[] | undefined;
    if (Array.isArray(servicesRaw)) {
      const s = servicesRaw.filter(
        (x): x is BookingServiceId =>
          typeof x === "string" && (SERVICE_KEYS as readonly string[]).includes(x as BookingServiceId),
      );
      services = s.length ? s : undefined;
    }
    out.push({ id, items, price, services, ...(label ? { label } : {}), ...(blurb ? { blurb } : {}) });
  }
  return out;
}

/** Hydrate a row from `pricing_versions` (Postgres jsonb). */
export function parsePricingRatesSnapshotFromDbRow(row: {
  code_version: number;
  services: unknown;
  extras: unknown;
  rules: unknown;
}): PricingRatesSnapshot | null {
  if (typeof row.code_version !== "number" || !Number.isFinite(row.code_version)) return null;
  if (!row.services || typeof row.services !== "object" || Array.isArray(row.services)) return null;
  const services: Partial<Record<BookingServiceId, ServiceTariff>> = {};
  const svcObj = row.services as Record<string, unknown>;
  for (const k of SERVICE_KEYS) {
    const v = svcObj[k];
    if (!isServiceTariff(v)) return null;
    services[k] = v;
  }

  if (!row.extras || typeof row.extras !== "object" || Array.isArray(row.extras)) return null;
  const extras: Record<string, SnapshotExtraRow> = {};
  for (const [slug, raw] of Object.entries(row.extras as Record<string, unknown>)) {
    if (!raw || typeof raw !== "object") continue;
    const o = raw as Record<string, unknown>;
    const price = typeof o.price === "number" && Number.isFinite(o.price) ? Math.round(o.price) : NaN;
    const serv = Array.isArray(o.services)
      ? o.services.filter(
          (x): x is BookingServiceId =>
            typeof x === "string" && (SERVICE_KEYS as readonly string[]).includes(x as BookingServiceId),
        )
      : [];
    if (!Number.isFinite(price)) continue;
    const name = typeof o.name === "string" && o.name.trim() ? o.name.trim() : undefined;
    const description =
      typeof o.description === "string" && o.description.trim() ? o.description.trim() : undefined;
    const isPopular = o.isPopular === true || o.is_popular === true;
    extras[slug] = {
      price,
      services: serv,
      ...(name ? { name } : {}),
      ...(description ? { description } : {}),
      ...(isPopular ? { isPopular: true as const } : {}),
    };
  }

  const bundles = parseBundles(row.rules);

  return {
    codeVersion: Math.round(row.code_version),
    services: services as Record<BookingServiceId, ServiceTariff>,
    extras,
    bundles,
  };
}
