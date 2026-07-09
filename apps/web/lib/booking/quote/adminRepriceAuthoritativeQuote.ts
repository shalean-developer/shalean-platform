import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { loadBookingV2Catalog } from "@/lib/booking-v2/loadBookingV2Catalog";
import { DB_SLUG_MAP } from "@/lib/booking-v2/loadBookingV2CatalogMaps";
import { isStructuredPricingBreakdown } from "@/lib/booking-v2/types";
import type { CustomerPricingBreakdown } from "@/lib/booking-v2/types";
import type { ServiceSlug } from "@/src/features/booking-v2/config/serviceConfig";
import { SERVICE_SLUGS } from "@/src/features/booking-v2/config/serviceConfig";
import {
  buildAuthoritativeQuotePersistPatch,
  buildLegacyLockDurationPersistPatch,
} from "@/lib/booking/quote/bookingQuotePersistence";
import { resolveLegacyJobDurationWorkload } from "@/lib/booking/quote/resolveBookingDurationWorkload";
import { resolveBookingV2Quote } from "@/lib/booking/quote/resolveBookingQuote";
import type { LockedBooking } from "@/lib/booking/lockedBooking";
import type { PricingRatesSnapshot } from "@/lib/pricing/pricingRatesSnapshot";
import type { PricingJobInput } from "@/lib/pricing/pricingEngine";

const SERVICE_SLUG_SET = new Set<string>(SERVICE_SLUGS);

export function isV2AuthoritativeBookingRow(row: {
  pricing_summary?: unknown;
  booking_snapshot?: unknown;
}): boolean {
  if (isStructuredPricingBreakdown(row.pricing_summary)) return true;
  const snap = row.booking_snapshot;
  if (!snap || typeof snap !== "object") return false;
  const ps = (snap as { pricingSummary?: unknown }).pricingSummary;
  return isStructuredPricingBreakdown(ps);
}

export function serviceSlugFromBookingRow(row: {
  booking_snapshot?: unknown;
  service_slug?: string | null;
  service?: string | null;
}): ServiceSlug | null {
  const snap = row.booking_snapshot;
  if (snap && typeof snap === "object") {
    const slug = (snap as { serviceSlug?: unknown }).serviceSlug;
    if (typeof slug === "string" && SERVICE_SLUG_SET.has(slug)) {
      return slug as ServiceSlug;
    }
  }
  const dbSlug = String(row.service_slug ?? row.service ?? "").trim().toLowerCase();
  if (!dbSlug) return null;
  for (const v2Slug of SERVICE_SLUGS) {
    if (DB_SLUG_MAP[v2Slug] === dbSlug || v2Slug === dbSlug) return v2Slug;
  }
  return null;
}

function readSnapshotRecord(snap: unknown): Record<string, unknown> {
  return snap && typeof snap === "object" && !Array.isArray(snap)
    ? (snap as Record<string, unknown>)
    : {};
}

function serviceDetailsWithCounts(
  base: Record<string, string | number | boolean>,
  serviceSlug: ServiceSlug,
  nextRooms: number,
  nextBaths: number,
  nextExtras: string[],
): Record<string, string | number | boolean> {
  const details = { ...base };
  if (serviceSlug === "carpet-cleaning") {
    details.carpetRooms = String(nextRooms);
  } else if (serviceSlug === "office-cleaning") {
    details.bathrooms = String(nextBaths);
  } else {
    details.bedrooms = String(nextRooms);
    details.bathrooms = String(nextBaths);
  }
  if (nextExtras.length) {
    details.extraRooms = details.extraRooms ?? "0";
  }
  return details;
}

export type AdminV2RepriceQuoteResult =
  | {
      ok: true;
      visitRounded: number;
      visitCents: number;
      quotePatch: Record<string, unknown>;
      breakdown: CustomerPricingBreakdown;
      snapMerged: Record<string, unknown>;
    }
  | { ok: false; status: number; error: string };

export async function computeAdminV2RepriceAuthoritativeQuote(params: {
  row: Record<string, unknown>;
  snap: unknown;
  nextRooms: number;
  nextBaths: number;
  nextExtras: string[];
  notes?: string;
}): Promise<AdminV2RepriceQuoteResult> {
  const serviceSlug = serviceSlugFromBookingRow(params.row);
  if (!serviceSlug) {
    return { ok: false, status: 400, error: "Could not determine booking-v2 service for repricing." };
  }

  const snapRec = readSnapshotRecord(params.snap);
  const baseDetails =
    snapRec.serviceDetails && typeof snapRec.serviceDetails === "object" && !Array.isArray(snapRec.serviceDetails)
      ? (snapRec.serviceDetails as Record<string, string | number | boolean>)
      : {};

  const cleanerMode =
    snapRec.cleanerMode === "team" || snapRec.cleanerMode === "individual_cleaners"
      ? snapRec.cleanerMode
      : "individual_cleaners";
  const cleanerCount =
    typeof snapRec.cleanerCount === "number" && Number.isFinite(snapRec.cleanerCount)
      ? Math.max(1, Math.round(snapRec.cleanerCount))
      : 1;
  const bookingType = snapRec.bookingType === "recurring" ? "recurring" : "once_off";
  const recurringFrequency =
    typeof snapRec.recurringFrequency === "string" ? snapRec.recurringFrequency : "";

  let catalogPayload;
  try {
    catalogPayload = await loadBookingV2Catalog();
  } catch {
    return {
      ok: false,
      status: 503,
      error: "Pricing catalog is unavailable for this booking. Try again later.",
    };
  }

  const liveConfig = catalogPayload.catalog[serviceSlug];
  if (!liveConfig) {
    return { ok: false, status: 400, error: "Service catalog entry missing for repricing." };
  }

  const serviceDetails = serviceDetailsWithCounts(
    baseDetails,
    serviceSlug,
    params.nextRooms,
    params.nextBaths,
    params.nextExtras,
  );

  const quote = resolveBookingV2Quote({
    serviceSlug,
    serviceLabel: liveConfig.label,
    serviceDetails,
    selectedExtras: params.nextExtras,
    cleanerMode,
    cleanerCount,
    bookingType,
    recurringFrequency,
    equipmentRequired: snapRec.equipmentRequired === "yes",
    equipmentQuote:
      snapRec.equipmentQuote && typeof snapRec.equipmentQuote === "object"
        ? (snapRec.equipmentQuote as import("@/lib/booking-v2/equipmentPricing").EquipmentQuoteResult)
        : null,
    catalog: {
      basePrice: liveConfig.basePrice,
      pricePerBedroom: liveConfig.pricePerBedroom,
      pricePerBathroom: liveConfig.pricePerBathroom,
      pricePerExtraRoom: liveConfig.pricePerExtraRoom,
      pricePerExtraCleaner: liveConfig.pricePerExtraCleaner,
      estimatedDurationHours: liveConfig.estimatedDurationHours,
      minDurationHours: liveConfig.minDurationHours,
      maxDurationHours: liveConfig.maxDurationHours,
      extras: liveConfig.extras,
      allowsExtraCleaner: liveConfig.allowsExtraCleaner,
      showEquipmentQuestion: liveConfig.showEquipmentQuestion,
    },
    feesConfig: catalogPayload.feesConfig,
  });

  const date = typeof params.row.date === "string" ? params.row.date.trim() : "";
  const time = typeof params.row.time === "string" ? params.row.time.trim().slice(0, 5) : "";

  const quotePatch = buildAuthoritativeQuotePersistPatch({
    breakdown: quote.breakdown,
    schedule: date && time ? { date, time } : null,
  });

  const visitRounded = Math.round(quote.customer_price_zar);
  const visitCents = visitRounded * 100;

  const snapMerged = JSON.parse(JSON.stringify(snapRec)) as Record<string, unknown>;
  snapMerged.serviceDetails = serviceDetails;
  snapMerged.selectedExtras = params.nextExtras;
  snapMerged.pricingSummary = quote.breakdown;
  if (params.notes !== undefined) {
    snapMerged.admin_notes = params.notes;
  }

  return {
    ok: true,
    visitRounded,
    visitCents,
    quotePatch,
    breakdown: quote.breakdown,
    snapMerged,
  };
}

export function legacyRepriceUnifiedDurationPatch(params: {
  lockedPersist: LockedBooking;
  rates: PricingRatesSnapshot;
  schedule?: { date: string; time: string } | null;
}): Record<string, unknown> {
  const job: PricingJobInput = {
    service: params.lockedPersist.service ?? null,
    serviceType: params.lockedPersist.service_type ?? undefined,
    rooms: params.lockedPersist.rooms ?? 1,
    bathrooms: params.lockedPersist.bathrooms ?? 1,
    extraRooms: params.lockedPersist.extraRooms ?? 0,
    extras: params.lockedPersist.extras ?? [],
  };

  const workload = resolveLegacyJobDurationWorkload(job, 1, params.rates);
  return {
    ...buildLegacyLockDurationPersistPatch({
      locked: {
        ...params.lockedPersist,
        finalHours: workload.duration_minutes / 60,
        duration: workload.duration_minutes / 60,
      },
      schedule: params.schedule ?? null,
    }),
    cleaner_workload: workload.workload_weight,
  };
}
