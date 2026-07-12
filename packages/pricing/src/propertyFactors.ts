/**
 * Shared booking-v2 property factor pricing (Phase 3).
 * Used by apps/web and apps/customer-mobile display/SoT calculators.
 */

export type PropertyFactorRatesConfig = {
  propertyType?: Record<string, number>;
  officeSize?: Record<string, number>;
  lastCleaned?: Record<string, number>;
  furnished?: Record<string, number>;
  carpetType?: Record<string, number>;
  stains?: Record<string, number>;
  carpetRooms_per_room_zar?: number;
};

export type PropertyFactorResult = {
  bedrooms_price: number;
  bathrooms_price: number;
  extra_rooms_price: number;
  property_size_price: number;
  property_factors_total: number;
  factorLines: Array<{ key: string; label: string; amountZar: number }>;
};

export const ROOM_BASED_SERVICE_SLUGS = new Set([
  "regular-cleaning",
  "deep-cleaning",
  "moving-cleaning",
  "airbnb-cleaning",
]);

export const EXTRA_CLEANER_SERVICE_SLUGS = new Set([
  "regular-cleaning",
  "airbnb-cleaning",
  "office-cleaning",
  "carpet-cleaning",
]);

function parseCount(details: Record<string, string | number | boolean>, key: string): number {
  const raw = details[key];
  if (raw === "" || raw == null) return 0;
  const n = typeof raw === "number" ? raw : parseInt(String(raw), 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function lookupTier(table: Record<string, number> | undefined, value: string): number {
  if (!table || !value) return 0;
  const amount = table[value];
  return typeof amount === "number" && Number.isFinite(amount) ? amount : 0;
}

function applyTierFactor(
  lines: PropertyFactorResult["factorLines"],
  rates: PropertyFactorRatesConfig,
  tableKey: keyof PropertyFactorRatesConfig,
  detailKey: string,
  label: string,
  details: Record<string, string | number | boolean>,
): number {
  const table = rates[tableKey];
  if (!table || typeof table !== "object" || typeof table === "number") return 0;
  const value = String(details[detailKey] ?? "").trim();
  if (!value) return 0;
  const amount = lookupTier(table as Record<string, number>, value);
  if (amount > 0) lines.push({ key: detailKey, label, amountZar: amount });
  return amount;
}

export function computePropertyFactors(
  serviceSlug: string,
  serviceDetails: Record<string, string | number | boolean>,
  catalog: {
    pricePerBedroom: number;
    pricePerBathroom: number;
    pricePerExtraRoom: number;
  },
  propertyFactorRates: PropertyFactorRatesConfig | null | undefined,
): PropertyFactorResult {
  const lines: PropertyFactorResult["factorLines"] = [];
  let bedrooms_price = 0;
  let bathrooms_price = 0;
  let extra_rooms_price = 0;
  let property_size_price = 0;
  const rates = propertyFactorRates ?? {};

  if (ROOM_BASED_SERVICE_SLUGS.has(serviceSlug)) {
    const bedrooms = parseCount(serviceDetails, "bedrooms");
    const bathrooms = parseCount(serviceDetails, "bathrooms");
    const extraRooms = parseCount(serviceDetails, "extraRooms");

    if (bedrooms > 0 && catalog.pricePerBedroom > 0) {
      bedrooms_price = bedrooms * catalog.pricePerBedroom;
      lines.push({
        key: "bedrooms",
        label: `${bedrooms} bedroom${bedrooms > 1 ? "s" : ""}`,
        amountZar: bedrooms_price,
      });
    }
    if (bathrooms > 0 && catalog.pricePerBathroom > 0) {
      bathrooms_price = bathrooms * catalog.pricePerBathroom;
      lines.push({
        key: "bathrooms",
        label: `${bathrooms} bathroom${bathrooms > 1 ? "s" : ""}`,
        amountZar: bathrooms_price,
      });
    }
    if (extraRooms > 0 && catalog.pricePerExtraRoom > 0) {
      extra_rooms_price = extraRooms * catalog.pricePerExtraRoom;
      lines.push({
        key: "extraRooms",
        label: `${extraRooms} extra room${extraRooms > 1 ? "s" : ""}`,
        amountZar: extra_rooms_price,
      });
    }

    property_size_price += applyTierFactor(
      lines,
      rates,
      "propertyType",
      "propertyType",
      "Property type adjustment",
      serviceDetails,
    );
  }

  if (serviceSlug === "office-cleaning") {
    property_size_price += applyTierFactor(
      lines,
      rates,
      "officeSize",
      "officeSize",
      "Office size",
      serviceDetails,
    );
    const bathrooms = parseCount(serviceDetails, "bathrooms");
    if (bathrooms > 0 && catalog.pricePerBathroom > 0) {
      bathrooms_price = bathrooms * catalog.pricePerBathroom;
      lines.push({
        key: "bathrooms",
        label: `${bathrooms} bathroom / kitchenette${bathrooms > 1 ? "s" : ""}`,
        amountZar: bathrooms_price,
      });
    }
  }

  if (serviceSlug === "carpet-cleaning") {
    const carpetRooms = parseCount(serviceDetails, "carpetRooms");
    const perRoom =
      rates.carpetRooms_per_room_zar && rates.carpetRooms_per_room_zar > 0
        ? rates.carpetRooms_per_room_zar
        : catalog.pricePerBedroom;

    if (carpetRooms > 0 && perRoom > 0) {
      property_size_price = carpetRooms * perRoom;
      lines.push({
        key: "carpetRooms",
        label: `${carpetRooms} carpeted room${carpetRooms > 1 ? "s" : ""}`,
        amountZar: property_size_price,
      });
    }

    property_size_price += applyTierFactor(
      lines,
      rates,
      "propertyType",
      "propertyType",
      "Property type adjustment",
      serviceDetails,
    );
    property_size_price += applyTierFactor(
      lines,
      rates,
      "carpetType",
      "carpetType",
      "Carpet type",
      serviceDetails,
    );
    property_size_price += applyTierFactor(
      lines,
      rates,
      "stains",
      "stains",
      "Stain treatment prep",
      serviceDetails,
    );
  }

  if (serviceSlug === "deep-cleaning") {
    property_size_price += applyTierFactor(
      lines,
      rates,
      "lastCleaned",
      "lastCleaned",
      "Property condition",
      serviceDetails,
    );
  }

  if (serviceSlug === "moving-cleaning") {
    property_size_price += applyTierFactor(
      lines,
      rates,
      "furnished",
      "furnished",
      "Furnished property",
      serviceDetails,
    );
  }

  const roomTotal = bedrooms_price + bathrooms_price + extra_rooms_price;
  return {
    bedrooms_price,
    bathrooms_price,
    extra_rooms_price,
    property_size_price,
    property_factors_total: roomTotal + property_size_price,
    factorLines: lines,
  };
}
