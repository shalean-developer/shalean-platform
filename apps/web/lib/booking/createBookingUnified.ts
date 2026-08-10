import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { parseBookingServiceId } from "@/components/booking/serviceCategories";
import {
  buildExactSourceLineItems,
  buildHomeWidgetCatalogLineItems,
  buildMonthlyBundledZarLineItems,
} from "@/lib/booking/buildBookingLineItems";
import type { BookingLineItemInsert } from "@/lib/booking/bookingLineItemTypes";
import { MIN_REASONABLE_BOOKING_DURATION_MINUTES } from "@/lib/booking/durationMinutesIntegrity";
import type { BookingSnapshotV1 } from "@/lib/booking/paystackChargeTypes";
import { persistBookingLineItems } from "@/lib/booking/persistBookingLineItems";
import {
  buildPriceSnapshotV1FromLineItems,
  extractDeclaredTotalCentsFromRowBase,
  sumLineItemsCents,
} from "@/lib/booking/priceSnapshotBooking";
import { estimatedFinishAtIso } from "@/lib/booking/quote/bookingQuotePersistence";
import {
  durationHoursFromMinutes,
  resolveLegacyJobDurationWorkload,
} from "@/lib/booking/quote/resolveBookingDurationWorkload";
import { logSystemEvent } from "@/lib/logging/systemLog";
import { resolveTenureBasedCleanerShareForBookingRow } from "@/lib/payout/tenureBasedCleanerLineShare";
import {
  sanitizeBookingExtrasForPersist,
  type BookingExtraPersistRow,
} from "@/lib/booking/sanitizeBookingExtrasForPersist";
import type { HomeWidgetServiceKey } from "@/lib/pricing/calculateCatalogPrice";
import type { PricingRatesSnapshot } from "@/lib/pricing/pricingRatesSnapshot";

/**
 * Single server path for **non–Paystack** `bookings` inserts that must carry consistent
 * `rooms` / `bathrooms` / `extras` + `booking_snapshot.flat` for cleaner scope and audits.
 *
 * Paystack checkout (`insertPendingPaymentBookingRow`, `upsertBookingFromPaystack`) and
 * `/api/booking/lock` stay on their own lifecycle by design.
 */

export type LineItemsPricingContext =
  | {
      mode: "home_widget_catalog";
      snapshot: PricingRatesSnapshot;
      widgetService: HomeWidgetServiceKey;
      extraRooms: number;
    }
  | {
      mode: "monthly_bundled_zar";
      quotedTotalZar: number | null;
      bundleLabel: string;
    }
  | {
      mode: "exact_source_lines";
      declaredTotalCents: number;
      source: string;
      lines: readonly { name: string; quantity: number; unitPriceCents: number }[];
    };

export type InsertBookingRowUnifiedArgs = {
  /** e.g. `admin_monthly`, `dashboard_monthly`, `homepage_widget` */
  source: string;
  /** All columns except `rooms`, `bathrooms`, `extras`, `booking_snapshot` (set here). */
  rowBase: Record<string, unknown>;
  rooms: number;
  bathrooms: number;
  extrasRaw?: unknown[];
  /** Stored on `booking_snapshot.flat.service` (lowercase slug, e.g. `standard`). */
  serviceSlugForFlat: string;
  locationForFlat: string | null;
  dateForFlat: string | null;
  timeForFlat: string | null;
  /** Spread into `booking_snapshot` after `v` + `flat` (e.g. widget intake, admin notes). */
  snapshotExtension?: Record<string, unknown> | null;
  /** PostgREST select list; default `id`. */
  select?: string;
  /** Set false to skip `system_logs` row (e.g. ultra-hot paths). Default true. */
  logInsert?: boolean;
  /** When set, inserts immutable canonical `booking_line_items` after the booking row. */
  lineItemsPricing?: LineItemsPricingContext | null;
};

export type InsertBookingRowUnifiedResult =
  | { ok: true; id: string; row: Record<string, unknown> | null }
  | { ok: false; error: string; pgCode?: string };

function buildLineItemsForUnifiedInsert(
  args: InsertBookingRowUnifiedArgs,
  rooms: number,
  bathrooms: number,
  extrasPersist: ReturnType<typeof sanitizeBookingExtrasForPersist>,
): BookingLineItemInsert[] | null {
  if (!args.lineItemsPricing) return null;
  if (args.lineItemsPricing.mode === "home_widget_catalog") {
    return buildHomeWidgetCatalogLineItems({
      snapshot: args.lineItemsPricing.snapshot,
      widgetService: args.lineItemsPricing.widgetService,
      bedrooms: rooms,
      bathrooms: bathrooms,
      extraRooms: args.lineItemsPricing.extraRooms,
      extraSlugs: extrasPersist.map((e) => e.slug),
    });
  }
  if (args.lineItemsPricing.mode === "monthly_bundled_zar") {
    return buildMonthlyBundledZarLineItems({
      quotedTotalZar: args.lineItemsPricing.quotedTotalZar,
      bundleLabel: args.lineItemsPricing.bundleLabel,
      extras: extrasPersist,
    });
  }
  if (args.lineItemsPricing.mode === "exact_source_lines") {
    return buildExactSourceLineItems(args.lineItemsPricing);
  }
  return null;
}

function clampRoomCount(n: number): number {
  return Math.min(20, Math.max(1, Math.round(n)));
}

function validDurationMinutes(v: unknown): number | null {
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    if (!Number.isFinite(n)) return null;
    v = n;
  }
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  const rounded = Math.round(v);
  if (rounded < MIN_REASONABLE_BOOKING_DURATION_MINUTES) return null;
  return rounded;
}

/**
 * Persist scheduling duration on unified inserts (admin monthly / dashboard / widget).
 * Prefer an explicit `duration_minutes` already on `rowBase`; otherwise derive from
 * rooms + service + extras so completion / assign gates are never missing duration.
 * Team jobs use wall-clock (team-scaled) minutes.
 */
export function buildUnifiedInsertDurationPatch(params: {
  rowBase: Record<string, unknown>;
  rooms: number;
  bathrooms: number;
  extras: BookingExtraPersistRow[];
  serviceSlugForFlat: string;
  dateForFlat: string | null;
  timeForFlat: string | null;
  /** Quoted extra rooms (homepage widget / catalog). Defaults to 0. */
  extraRooms?: number;
}): Record<string, unknown> {
  const fromRow =
    validDurationMinutes(params.rowBase.duration_minutes) ??
    validDurationMinutes(params.rowBase.estimated_duration_minutes);
  let minutes = fromRow;
  if (minutes == null) {
    const service =
      parseBookingServiceId(String(params.serviceSlugForFlat ?? "").trim()) ??
      parseBookingServiceId(String(params.rowBase.service_slug ?? params.rowBase.service ?? "").trim());
    const snapCount = params.rowBase.team_member_count_snapshot;
    const cleanerCount = params.rowBase.cleaner_count;
    const teamCount =
      typeof snapCount === "number" && Number.isFinite(snapCount) && snapCount >= 1
        ? Math.min(20, Math.round(snapCount))
        : typeof cleanerCount === "number" && Number.isFinite(cleanerCount) && cleanerCount >= 1
          ? Math.min(20, Math.round(cleanerCount))
          : params.rowBase.is_team_job === true
            ? 2
            : 1;
    const extraRoomsRaw = params.extraRooms;
    const extraRooms =
      typeof extraRoomsRaw === "number" && Number.isFinite(extraRoomsRaw) && extraRoomsRaw > 0
        ? Math.min(50, Math.round(extraRoomsRaw))
        : 0;
    const workload = resolveLegacyJobDurationWorkload(
      {
        service,
        rooms: params.rooms,
        bathrooms: params.bathrooms,
        extraRooms,
        extras: params.extras.map((e) => e.slug),
      },
      teamCount,
    );
    const candidate =
      teamCount > 1 &&
      typeof workload.team_scaled_duration_minutes === "number" &&
      Number.isFinite(workload.team_scaled_duration_minutes)
        ? workload.team_scaled_duration_minutes
        : workload.duration_minutes;
    minutes = validDurationMinutes(candidate);
  }
  if (minutes == null) return {};

  const dateYmd =
    String(params.rowBase.date ?? params.dateForFlat ?? "").trim() || null;
  const timeHm =
    String(params.rowBase.time ?? params.timeForFlat ?? "").trim() || null;
  const patch: Record<string, unknown> = {
    duration_minutes: minutes,
    estimated_duration_minutes:
      validDurationMinutes(params.rowBase.estimated_duration_minutes) ?? minutes,
    duration_hours:
      typeof params.rowBase.duration_hours === "number" &&
      Number.isFinite(params.rowBase.duration_hours) &&
      params.rowBase.duration_hours > 0
        ? Math.round(params.rowBase.duration_hours * 10) / 10
        : durationHoursFromMinutes(minutes),
  };
  const finishAt = estimatedFinishAtIso(dateYmd, timeHm, minutes);
  if (finishAt && params.rowBase.estimated_finish_at == null) {
    patch.estimated_finish_at = finishAt;
  }
  return patch;
}

/** Throws if scope is not a valid persisted contract. */
export function assertBookingScope(rooms: number, bathrooms: number): void {
  if (!Number.isFinite(rooms) || !Number.isFinite(bathrooms)) {
    throw new Error("rooms and bathrooms must be finite numbers.");
  }
  if (rooms < 1 || rooms > 20 || bathrooms < 1 || bathrooms > 20) {
    throw new Error("rooms and bathrooms must be between 1 and 20.");
  }
}

export async function insertBookingRowUnified(
  admin: SupabaseClient,
  args: InsertBookingRowUnifiedArgs,
): Promise<InsertBookingRowUnifiedResult> {
  assertBookingScope(args.rooms, args.bathrooms);
  const rooms = clampRoomCount(args.rooms);
  const bathrooms = clampRoomCount(args.bathrooms);
  const extrasPersist = sanitizeBookingExtrasForPersist(args.extrasRaw ?? [], {
    where: args.source,
  });

  const flat = {
    service: args.serviceSlugForFlat,
    rooms,
    bathrooms,
    extras: extrasPersist.map((e) => e.slug),
    location: args.locationForFlat,
    date: args.dateForFlat,
    time: args.timeForFlat,
  };

  const booking_snapshot = {
    v: 1,
    flat,
    ...(args.snapshotExtension && typeof args.snapshotExtension === "object" ? args.snapshotExtension : {}),
  } as BookingSnapshotV1;

  const prebuiltLineItems = buildLineItemsForUnifiedInsert(args, rooms, bathrooms, extrasPersist);
  if (prebuiltLineItems) {
    if (prebuiltLineItems.length === 0) {
      return { ok: false, error: "Pricing line items are required (empty quote)." };
    }
    const declaredCents = extractDeclaredTotalCentsFromRowBase(args.rowBase);
    if (declaredCents == null) {
      return { ok: false, error: "Declared total is missing for priced booking (total_paid_zar / total_price)." };
    }
    const sumCents = sumLineItemsCents(prebuiltLineItems);
    if (sumCents !== declaredCents) {
      return {
        ok: false,
        error: `Price mismatch: line items sum to ${(sumCents / 100).toFixed(2)} ZAR but declared total is ${(declaredCents / 100).toFixed(2)} ZAR.`,
      };
    }
  }

  const totalZarForSnapshot =
    prebuiltLineItems != null
      ? Math.round(sumLineItemsCents(prebuiltLineItems) / 100)
      : null;
  const price_snapshot =
    prebuiltLineItems != null && totalZarForSnapshot != null
      ? buildPriceSnapshotV1FromLineItems({
          serviceTypeSlug: String(args.serviceSlugForFlat ?? "standard").trim() || "standard",
          lineItems: prebuiltLineItems,
          totalPriceZar: totalZarForSnapshot,
        })
      : null;

  const rb = args.rowBase as Record<string, unknown>;
  const cleanerIdForSnap = String(rb.cleaner_id ?? rb.selected_cleaner_id ?? "").trim() || null;
  const dateYmd = String(rb.date ?? args.dateForFlat ?? "").trim() || null;
  const timeHm = String(rb.time ?? args.timeForFlat ?? "").trim() || null;
  const tenureShare = await resolveTenureBasedCleanerShareForBookingRow({
    admin,
    cleanerId: cleanerIdForSnap,
    bookingDate: dateYmd,
    bookingTime: timeHm,
  });

  const durationExtraRooms =
    args.lineItemsPricing?.mode === "home_widget_catalog"
      ? Math.max(0, Math.round(Number(args.lineItemsPricing.extraRooms) || 0))
      : 0;

  const durationPatch = buildUnifiedInsertDurationPatch({
    rowBase: args.rowBase,
    rooms,
    bathrooms,
    extras: extrasPersist,
    serviceSlugForFlat: args.serviceSlugForFlat,
    dateForFlat: args.dateForFlat,
    timeForFlat: args.timeForFlat,
    extraRooms: durationExtraRooms,
  });

  const insertRow = {
    ...args.rowBase,
    rooms,
    bathrooms,
    extras: extrasPersist,
    booking_snapshot,
    ...durationPatch,
    ...(tenureShare != null ? { cleaner_share_percentage: tenureShare } : {}),
    ...(price_snapshot ? { price_snapshot } : {}),
  };

  const selectList = (args.select ?? "id").trim() || "id";
  const { data, error } = await admin.from("bookings").insert(insertRow).select(selectList).maybeSingle();

  if (error) {
    const code = typeof (error as { code?: unknown }).code === "string" ? (error as { code: string }).code : undefined;
    return { ok: false, error: error.message, pgCode: code };
  }
  const rec = data && typeof data === "object" ? (data as Record<string, unknown>) : null;
  const id = rec && typeof rec.id === "string" ? rec.id : "";
  if (!id) {
    return { ok: false, error: "Insert returned no id." };
  }

  if (prebuiltLineItems && prebuiltLineItems.length > 0) {
    const persisted = await persistBookingLineItems(admin, id, prebuiltLineItems);
    if (!persisted.ok) {
      await admin.from("bookings").delete().eq("id", id);
      return { ok: false, error: persisted.error || "Could not save booking line items." };
    }
  }

  if (args.logInsert !== false) {
    void logSystemEvent({
      level: "info",
      source: "insertBookingRowUnified",
      message: "booking_created",
      context: {
        type: "booking_created",
        source: args.source,
        bookingId: id,
        rooms,
        bathrooms,
        extrasCount: extrasPersist.length,
      },
    });
  }

  return { ok: true, id, row: rec };
}

/** Alias for {@link insertBookingRowUnified} — single entry for scoped `bookings` inserts outside Paystack. */
export const createBookingUnified = insertBookingRowUnified;
