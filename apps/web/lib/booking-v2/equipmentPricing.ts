import { haversineDistanceKm } from "@/lib/dispatch/distance";
import { getLocationFallbackCoords } from "@/lib/locations/bookingLocations";

export type EquipmentPricingConfig = {
  is_active: boolean;
  base_fee_zar: number;
  price_per_km_zar: number;
  max_auto_distance_km: number;
  base_address: string;
  base_latitude: number;
  base_longitude: number;
  manual_quote_message: string;
};

export type EquipmentQuoteResult = {
  distance_km: number;
  base_fee: number;
  price_per_km: number;
  distance_charge: number;
  logistics_fee: number;
  base_location: string;
  manual_quote_required: boolean;
  manual_quote_message: string;
  geocode_error?: boolean;
  /** How customer location was resolved for distance. */
  distance_source?: "geocode" | "suburb_centroid";
  customer_latitude?: number;
  customer_longitude?: number;
};

export type EquipmentPricingSnapshot = EquipmentPricingConfig & {
  quoted_at: string;
  customer_latitude?: number;
  customer_longitude?: number;
  distance_km?: number;
  distance_source?: "geocode" | "suburb_centroid";
};

const DEFAULT_MANUAL_QUOTE_MESSAGE =
  "Manual quote required for equipment delivery and collection.";

export function defaultEquipmentPricingConfig(): EquipmentPricingConfig {
  return {
    is_active: true,
    base_fee_zar: 450,
    price_per_km_zar: 25,
    max_auto_distance_km: 20,
    base_address: "Shalean Equipment Base, Cape Town",
    base_latitude: -33.9768,
    base_longitude: 18.4686,
    manual_quote_message: DEFAULT_MANUAL_QUOTE_MESSAGE,
  };
}

export function parseEquipmentPricingConfig(raw: unknown): EquipmentPricingConfig {
  const defaults = defaultEquipmentPricingConfig();
  if (!raw || typeof raw !== "object") return defaults;
  const o = raw as Record<string, unknown>;

  const baseFee = Number(o.base_fee_zar);
  const pricePerKm = Number(o.price_per_km_zar);
  const maxDistance = Number(o.max_auto_distance_km);
  const baseLat = Number(o.base_latitude);
  const baseLng = Number(o.base_longitude);

  return {
    is_active: o.is_active !== false,
    base_fee_zar: Number.isFinite(baseFee) && baseFee >= 0 ? Math.round(baseFee) : defaults.base_fee_zar,
    price_per_km_zar:
      Number.isFinite(pricePerKm) && pricePerKm >= 0 ? Math.round(pricePerKm) : defaults.price_per_km_zar,
    max_auto_distance_km:
      Number.isFinite(maxDistance) && maxDistance > 0
        ? Math.round(maxDistance)
        : defaults.max_auto_distance_km,
    base_address:
      typeof o.base_address === "string" && o.base_address.trim()
        ? o.base_address.trim().slice(0, 500)
        : defaults.base_address,
    base_latitude:
      Number.isFinite(baseLat) && baseLat >= -90 && baseLat <= 90 ? baseLat : defaults.base_latitude,
    base_longitude:
      Number.isFinite(baseLng) && baseLng >= -180 && baseLng <= 180 ? baseLng : defaults.base_longitude,
    manual_quote_message:
      typeof o.manual_quote_message === "string" && o.manual_quote_message.trim()
        ? o.manual_quote_message.trim().slice(0, 500)
        : defaults.manual_quote_message,
  };
}

export function roundDistanceKm(km: number): number {
  return Math.round(km * 10) / 10;
}

export function computeEquipmentQuote(params: {
  config: EquipmentPricingConfig;
  distanceKm: number;
  equipmentRequired: boolean;
}): EquipmentQuoteResult {
  const { config, distanceKm, equipmentRequired } = params;
  const baseLocation = config.base_address;

  if (!equipmentRequired || !config.is_active) {
    return emptyEquipmentQuote(baseLocation, config.manual_quote_message);
  }

  const roundedDistance = roundDistanceKm(Math.max(0, distanceKm));

  if (roundedDistance > config.max_auto_distance_km) {
    return {
      distance_km: roundedDistance,
      base_fee: config.base_fee_zar,
      price_per_km: config.price_per_km_zar,
      distance_charge: 0,
      logistics_fee: 0,
      base_location: baseLocation,
      manual_quote_required: true,
      manual_quote_message: config.manual_quote_message,
    };
  }

  const distance_charge = Math.round(roundedDistance * config.price_per_km_zar);
  const logistics_fee = config.base_fee_zar + distance_charge;

  return {
    distance_km: roundedDistance,
    base_fee: config.base_fee_zar,
    price_per_km: config.price_per_km_zar,
    distance_charge,
    logistics_fee,
    base_location: baseLocation,
    manual_quote_required: false,
    manual_quote_message: config.manual_quote_message,
  };
}

export function emptyEquipmentQuote(
  baseLocation = "",
  manualQuoteMessage = DEFAULT_MANUAL_QUOTE_MESSAGE,
): EquipmentQuoteResult {
  return {
    distance_km: 0,
    base_fee: 0,
    price_per_km: 0,
    distance_charge: 0,
    logistics_fee: 0,
    base_location: baseLocation,
    manual_quote_required: false,
    manual_quote_message: manualQuoteMessage,
  };
}

export function computeDistanceKmFromCoords(
  config: EquipmentPricingConfig,
  customerLat: number,
  customerLng: number,
): number {
  return roundDistanceKm(
    haversineDistanceKm(
      config.base_latitude,
      config.base_longitude,
      customerLat,
      customerLng,
    ),
  );
}

export function buildEquipmentPricingSnapshot(params: {
  config: EquipmentPricingConfig;
  quote: EquipmentQuoteResult;
}): EquipmentPricingSnapshot {
  return {
    ...params.config,
    quoted_at: new Date().toISOString(),
    customer_latitude: params.quote.customer_latitude,
    customer_longitude: params.quote.customer_longitude,
    distance_km: params.quote.distance_km,
    distance_source: params.quote.distance_source,
  };
}

type ResolvedCustomerCoords = {
  latitude: number;
  longitude: number;
  distance_source: "geocode" | "suburb_centroid";
};

/** Street geocode first; fall back to known suburb centroid when Google is unavailable. */
export async function resolveCustomerCoordsForEquipment(parts: {
  address: string;
  suburb: string;
  city?: string;
  postalCode?: string;
}): Promise<ResolvedCustomerCoords | null> {
  const geocoded = await geocodeAddressServer(parts);
  if (geocoded.ok) {
    return {
      latitude: geocoded.latitude,
      longitude: geocoded.longitude,
      distance_source: "geocode",
    };
  }

  if (parts.suburb.trim().toLowerCase() === "other") {
    return null;
  }

  const fallback = getLocationFallbackCoords(parts.suburb);
  if (fallback) {
    return {
      latitude: fallback.lat,
      longitude: fallback.lng,
      distance_source: "suburb_centroid",
    };
  }

  return null;
}

export function buildAddressGeocodeQuery(parts: {
  address: string;
  suburb: string;
  city?: string;
  postalCode?: string;
}): string {
  return [parts.address, parts.suburb, parts.city ?? "Cape Town", parts.postalCode, "South Africa"]
    .map((s) => s?.trim())
    .filter(Boolean)
    .join(", ");
}

export type GeocodeResult =
  | { ok: true; latitude: number; longitude: number }
  | { ok: false; error: string };

/** Server-side Google Geocoding API lookup. */
export async function geocodeAddressServer(parts: {
  address: string;
  suburb: string;
  city?: string;
  postalCode?: string;
}): Promise<GeocodeResult> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY?.trim();
  if (!apiKey) {
    return { ok: false, error: "Geocoding is not configured." };
  }

  const query = buildAddressGeocodeQuery(parts);
  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("address", query);
  url.searchParams.set("region", "za");
  url.searchParams.set("key", apiKey);

  try {
    const res = await fetch(url.toString(), { next: { revalidate: 0 } });
    if (!res.ok) {
      return { ok: false, error: "Geocoding request failed." };
    }
    const data = (await res.json()) as {
      status?: string;
      results?: Array<{ geometry?: { location?: { lat?: number; lng?: number } } }>;
    };
    if (data.status !== "OK" || !data.results?.length) {
      return { ok: false, error: "Could not locate this address." };
    }
    const loc = data.results[0]?.geometry?.location;
    const lat = loc?.lat;
    const lng = loc?.lng;
    if (typeof lat !== "number" || typeof lng !== "number" || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      return { ok: false, error: "Invalid geocode result." };
    }
    return { ok: true, latitude: lat, longitude: lng };
  } catch {
    return { ok: false, error: "Geocoding request failed." };
  }
}

export async function quoteEquipmentForAddress(params: {
  config: EquipmentPricingConfig;
  address: string;
  suburb: string;
  city?: string;
  postalCode?: string;
  equipmentRequired: boolean;
}): Promise<EquipmentQuoteResult> {
  if (!params.equipmentRequired || !params.config.is_active) {
    return emptyEquipmentQuote(params.config.base_address, params.config.manual_quote_message);
  }

  const resolved = await resolveCustomerCoordsForEquipment({
    address: params.address,
    suburb: params.suburb,
    city: params.city,
    postalCode: params.postalCode,
  });

  if (!resolved) {
    return {
      ...emptyEquipmentQuote(params.config.base_address, params.config.manual_quote_message),
      manual_quote_required: true,
      geocode_error: true,
    };
  }

  const distanceKm = computeDistanceKmFromCoords(
    params.config,
    resolved.latitude,
    resolved.longitude,
  );

  const quote = computeEquipmentQuote({
    config: params.config,
    distanceKm,
    equipmentRequired: true,
  });

  return {
    ...quote,
    customer_latitude: resolved.latitude,
    customer_longitude: resolved.longitude,
    distance_source: resolved.distance_source,
  };
}

export function equipmentQuoteFromBreakdownFields(fields: {
  equipment_required?: boolean;
  equipment_distance_km?: number | null;
  equipment_base_fee?: number | null;
  equipment_price_per_km?: number | null;
  equipment_distance_charge?: number | null;
  equipment_logistics_fee?: number | null;
  equipment_base_location?: string | null;
  manual_quote_required?: boolean;
}): EquipmentQuoteResult | null {
  if (!fields.equipment_required) return null;
  return {
    distance_km: Number(fields.equipment_distance_km ?? 0),
    base_fee: Number(fields.equipment_base_fee ?? 0),
    price_per_km: Number(fields.equipment_price_per_km ?? 0),
    distance_charge: Number(fields.equipment_distance_charge ?? 0),
    logistics_fee: Number(fields.equipment_logistics_fee ?? 0),
    base_location: fields.equipment_base_location ?? "",
    manual_quote_required: Boolean(fields.manual_quote_required),
    manual_quote_message: DEFAULT_MANUAL_QUOTE_MESSAGE,
  };
}

export function equipmentPersistFields(params: {
  equipmentRequired: boolean;
  quote: EquipmentQuoteResult | null;
  pricingSnapshot: EquipmentPricingSnapshot | null;
  overrideReason?: string | null;
}) {
  const quote = params.quote;
  return {
    equipment_required: params.equipmentRequired,
    equipment_distance_km: quote?.distance_km ?? null,
    equipment_base_fee: quote?.base_fee ?? null,
    equipment_price_per_km: quote?.price_per_km ?? null,
    equipment_distance_charge: quote?.distance_charge ?? null,
    equipment_logistics_fee: quote?.logistics_fee ?? null,
    equipment_base_location: quote?.base_location ?? null,
    manual_quote_required: quote?.manual_quote_required ?? false,
    equipment_pricing_snapshot: params.pricingSnapshot,
    equipment_fee_override_reason: params.overrideReason?.trim() || null,
  };
}
