import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildHomeWidgetCatalogLineItems,
  buildMonthlyBundledZarLineItems,
} from "@/lib/booking/buildBookingLineItems";
import type { BookingSnapshotV1 } from "@/lib/booking/paystackChargeTypes";
import { persistBookingLineItems } from "@/lib/booking/persistBookingLineItems";
import { logSystemEvent } from "@/lib/logging/systemLog";
import { sanitizeBookingExtrasForPersist } from "@/lib/booking/sanitizeBookingExtrasForPersist";
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
  /** When set, inserts immutable `booking_line_items` after the booking row (Phase 1 dual-write). */
  lineItemsPricing?: LineItemsPricingContext | null;
};

export type InsertBookingRowUnifiedResult =
  | { ok: true; id: string; row: Record<string, unknown> | null }
  | { ok: false; error: string; pgCode?: string };

function clampRoomCount(n: number): number {
  return Math.min(20, Math.max(1, Math.round(n)));
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

  const insertRow = {
    ...args.rowBase,
    rooms,
    bathrooms,
    extras: extrasPersist,
    booking_snapshot,
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

  if (args.lineItemsPricing?.mode === "home_widget_catalog") {
    const li = buildHomeWidgetCatalogLineItems({
      snapshot: args.lineItemsPricing.snapshot,
      widgetService: args.lineItemsPricing.widgetService,
      bedrooms: rooms,
      bathrooms: bathrooms,
      extraRooms: args.lineItemsPricing.extraRooms,
      extraSlugs: extrasPersist.map((e) => e.slug),
    });
    await persistBookingLineItems(admin, id, li);
  } else if (args.lineItemsPricing?.mode === "monthly_bundled_zar") {
    const li = buildMonthlyBundledZarLineItems({
      quotedTotalZar: args.lineItemsPricing.quotedTotalZar,
      bundleLabel: args.lineItemsPricing.bundleLabel,
      extras: extrasPersist,
    });
    await persistBookingLineItems(admin, id, li);
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
