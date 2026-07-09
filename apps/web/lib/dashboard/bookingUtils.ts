import { resolveReportingDurationMinutes } from "@/lib/admin/reporting/bookingDurationReporting";
import type { BookingSnapshotV1 } from "@/lib/booking/paystackChargeTypes";
import {
  accessNotesFromBookingRow,
  cleanDetailLinesFromServiceDetails,
  extrasLinesFromBookingRow,
  hasPersistedSchedule,
  priceLinesFromPricingSummary,
  roomsBathroomsCountsFromServiceDetails,
  roomsLinesFromServiceDetails,
  serviceLabelFromBookingRow,
} from "@/lib/booking/bookingV2CustomerDisplay";
import { canonicalDbBookingStatus } from "@/lib/booking/canonicalBookingStatus";
import { isAuthoritativeBookingCompleted } from "@/lib/booking/deriveBookingOperationalPhase";
import type { BookingRow, CleanerEmbed, DashboardBooking, NormalizedBookingStatus } from "@/lib/dashboard/types";
import {
  parseStoredJobPriceBreakdown,
  parseStoredPriceBreakdown,
  priceLinesFromStoredCheckoutQuote,
  type StoredPriceLine,
} from "@/lib/dashboard/storedPriceBreakdown";

export type { NormalizedBookingStatus } from "@/lib/dashboard/types";

export function normalizeStatus(s: string | null | undefined): NormalizedBookingStatus {
  const raw = (s ?? "pending").toLowerCase();
  const v = canonicalDbBookingStatus(raw) || raw;
  if (
    raw === "pending_payment" ||
    raw === "payment_mismatch" ||
    raw === "payment_reconciliation_required"
  ) {
    return raw as NormalizedBookingStatus;
  }
  if (
    v === "pending" ||
    v === "pending_assignment" ||
    v === "offered" ||
    v === "assigned" ||
    v === "in_progress" ||
    v === "completed" ||
    v === "cancelled" ||
    v === "failed"
  ) {
    return v as NormalizedBookingStatus;
  }
  return "pending";
}

/** Checkout-locked total when `bookings.total_price` is set (Postgres numeric may arrive as string). */
export function lockedTotalZarFromRow(row: Pick<BookingRow, "total_price">): number | null {
  const v = row.total_price;
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n);
}

export function priceZarFromRow(row: BookingRow): number {
  const locked = lockedTotalZarFromRow(row);
  if (locked != null) return locked;
  const ps = row.pricing_summary;
  if (ps && typeof ps === "object" && !Array.isArray(ps)) {
    const estimated = (ps as { estimated_total?: unknown }).estimated_total;
    if (typeof estimated === "number" && Number.isFinite(estimated) && estimated > 0) {
      return Math.round(estimated);
    }
    const legacyTotal = (ps as { total?: unknown }).total;
    if (typeof legacyTotal === "number" && Number.isFinite(legacyTotal) && legacyTotal > 0) {
      return Math.round(legacyTotal);
    }
  }
  const bd = parseStoredPriceBreakdown(row.price_breakdown);
  if (bd) return bd.totalZar;
  if (typeof row.total_paid_zar === "number" && Number.isFinite(row.total_paid_zar)) return row.total_paid_zar;
  return Math.round((row.amount_paid_cents ?? 0) / 100);
}

function initials(name: string): string {
  const p = name.trim().split(/\s+/).filter(Boolean);
  if (p.length === 0) return "?";
  if (p.length === 1) return p[0]!.slice(0, 2).toUpperCase();
  return (p[0]![0] + p[p.length - 1]![0]).toUpperCase();
}

function positiveRoomCount(v: unknown): number | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  const n = Math.round(v);
  if (n < 1 || n > 50) return null;
  return n;
}

function humanizeExtraSlug(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** Labels for customer booking detail — persisted row first, then checkout snapshot fallbacks. */
function formatExtraDisplayLine(x: unknown): string | null {
  if (typeof x === "string") {
    const s = x.trim();
    return s ? humanizeExtraSlug(s) : null;
  }
  if (x && typeof x === "object") {
    const o = x as { name?: string; slug?: string; price?: unknown };
    const name = typeof o.name === "string" ? o.name.trim() : "";
    const slug = typeof o.slug === "string" ? o.slug.trim() : "";
    const displayName = name || (slug ? humanizeExtraSlug(slug) : "");
    if (!displayName) return null;
    const priceRaw = o.price;
    const p = typeof priceRaw === "number" ? priceRaw : Number(priceRaw);
    if (Number.isFinite(p) && p > 0) {
      return `${displayName} · R ${Math.round(p).toLocaleString("en-ZA")}`;
    }
    return displayName;
  }
  return null;
}

function extrasDisplayLinesFromPayload(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const x of raw) {
    const line = formatExtraDisplayLine(x);
    if (line) out.push(line);
  }
  return out;
}

/** Labels for dashboard only — from persisted `bookings.extras` line items when present. */
function extrasDisplayFromRow(row: BookingRow, snapshot: BookingSnapshotV1 | null): string[] {
  const fromRow = extrasDisplayLinesFromPayload(row.extras);
  if (fromRow.length) return fromRow;

  const locked = snapshot?.locked;
  const fromLineItems = extrasDisplayLinesFromPayload(locked?.extras_line_items);
  if (fromLineItems.length) return fromLineItems;

  const fromLockedSlugs = extrasDisplayLinesFromPayload(locked?.extras);
  if (fromLockedSlugs.length) return fromLockedSlugs;

  const fromFlat = extrasDisplayLinesFromPayload(snapshot?.flat?.extras);
  if (fromFlat.length) return fromFlat;

  return extrasLinesFromBookingRow(row);
}

function snapshotRooms(snapshot: BookingSnapshotV1 | null | undefined, rooms: number | null, bathrooms: number | null, row: BookingRow): string[] {
  const fromServiceDetails = roomsLinesFromServiceDetails(row.service_details);
  if (fromServiceDetails.length > 0) return fromServiceDetails;

  const locked = snapshot?.locked;
  const flat = snapshot?.flat;
  const bedroomCount =
    positiveRoomCount(rooms) ??
    positiveRoomCount(locked?.rooms) ??
    positiveRoomCount((locked as { bedrooms?: number } | undefined)?.bedrooms) ??
    positiveRoomCount(flat?.rooms) ??
    null;
  const bathroomCount =
    positiveRoomCount(bathrooms) ??
    positiveRoomCount(locked?.bathrooms) ??
    positiveRoomCount(flat?.bathrooms) ??
    null;

  const parts: string[] = [];
  if (bedroomCount != null) parts.push(`${bedroomCount} bedroom${bedroomCount === 1 ? "" : "s"}`);
  if (bathroomCount != null) parts.push(`${bathroomCount} bathroom${bathroomCount === 1 ? "" : "s"}`);

  const extraRooms = positiveRoomCount((locked as { extraRooms?: number } | undefined)?.extraRooms);
  if (extraRooms != null && extraRooms > 0) {
    parts.push(`${extraRooms} extra room${extraRooms === 1 ? "" : "s"}`);
  }

  return parts;
}

function priceLinesFromRow(row: BookingRow): StoredPriceLine[] {
  const fromPricingSummary = priceLinesFromPricingSummary(row.pricing_summary);
  if (fromPricingSummary) return fromPricingSummary;

  const breakdown = parseStoredPriceBreakdown(row.price_breakdown);
  const locked = lockedTotalZarFromRow(row);
  if (breakdown) {
    const totalForLines = locked ?? breakdown.totalZar;
    const jobSplit = parseStoredJobPriceBreakdown(row.price_breakdown);
    const pricingVersionId =
      typeof row.pricing_version_id === "string" && row.pricing_version_id.trim()
        ? row.pricing_version_id.trim()
        : null;
    return priceLinesFromStoredCheckoutQuote(breakdown, totalForLines, jobSplit, {
      pricingVersionId,
      pricingCatalogCodeVersion: breakdown.pricingVersion,
    });
  }
  return [{ kind: "total_paid_fallback", label: "Total paid", amountZar: priceZarFromRow(row) }];
}

/** Customer or cleaner UI: locked checkout lines from persisted `price_breakdown` + `total_price` only. */
export function checkoutPriceLinesFromPersisted(
  row: Pick<BookingRow, "price_breakdown" | "total_price" | "total_paid_zar" | "amount_paid_cents" | "pricing_version_id">,
): StoredPriceLine[] | null {
  const breakdown = parseStoredPriceBreakdown(row.price_breakdown);
  if (!breakdown) return null;
  const locked = lockedTotalZarFromRow(row);
  const totalForLines = locked ?? breakdown.totalZar;
  const jobSplit = parseStoredJobPriceBreakdown(row.price_breakdown);
  const pricingVersionId =
    typeof row.pricing_version_id === "string" && row.pricing_version_id.trim()
      ? row.pricing_version_id.trim()
      : null;
  return priceLinesFromStoredCheckoutQuote(breakdown, totalForLines, jobSplit, {
    pricingVersionId,
    pricingCatalogCodeVersion: breakdown.pricingVersion,
  });
}

export function priceZarFromPersisted(
  row: Pick<BookingRow, "total_price" | "price_breakdown" | "total_paid_zar" | "amount_paid_cents">,
): number {
  return priceZarFromRow(row as BookingRow);
}

function cleanerFromRow(row: BookingRow): DashboardBooking["cleaner"] {
  const emb = row.cleaners as CleanerEmbed;
  const snap = (row.booking_snapshot ?? null) as BookingSnapshotV1 | null;
  const snapName = snap?.cleaner_name;
  // M-15: surface the lead-cleaner name for H-8 team-assigned bookings
  // (where `cleaner_id` is null and the canonical embed cannot resolve a
  // name). Server-enriched via `applyTeamLeadCleanerNamesToRows` so the
  // dashboard reviews modal/list can show "Reviewing X's clean" without
  // exposing the rest of the team roster.
  //
  // Order:
  //   1. Embed (canonical for solo bookings — unchanged).
  //   2. Server-enriched team-lead name (only set for `is_team_job=true`
  //      rows whose `cleaner_id` is cleared). Wins over the snapshot
  //      because team handoffs can supersede the customer's pre-checkout
  //      cleaner pick.
  //   3. `booking_snapshot.cleaner_name` (legacy / pre-team-handoff fallback).
  const isTeamJobAssignment = row.is_team_job === true;
  const teamLead = isTeamJobAssignment ? String(row.payout_owner_cleaner_name ?? "").trim() : "";
  const enriched = String(row.display_cleaner_name ?? "").trim();
  const name =
    (emb?.full_name && emb.full_name.trim()) ||
    teamLead ||
    enriched ||
    (typeof snapName === "string" && snapName.trim()) ||
    "";
  if (!name) return null;
  const phone = emb?.phone?.trim() || undefined;
  return { name, initials: initials(name), phone };
}

export function mapBookingRow(row: BookingRow): DashboardBooking {
  const snapshot = (row.booking_snapshot ?? null) as BookingSnapshotV1 | null;
  const scheduleConfirmed = hasPersistedSchedule(row);
  const date = scheduleConfirmed
    ? row.date!
    : snapshot?.flat?.date && /^\d{4}-\d{2}-\d{2}$/.test(snapshot.flat.date)
      ? snapshot.flat.date
      : "";
  const time = scheduleConfirmed
    ? (row.time!.trim().length >= 5 ? row.time!.trim().slice(0, 5) : row.time!.trim())
    : snapshot?.flat?.time?.trim() || "";
  const loc = row.location?.trim() || snapshot?.flat?.location || "";
  // v2 bookings write `suburb` as its own column; use it directly when present.
  // Legacy bookings stored a combined "Street, Suburb" string in `location` — fall back to comma-split for those.
  const rowSuburb = typeof row.suburb === "string" ? row.suburb.trim() : "";
  const snapSuburb = (snapshot as { suburb?: string } | null)?.suburb?.trim() ?? "";
  const derivedSuburb = rowSuburb || snapSuburb || (loc.includes(",") ? loc.split(",").slice(-1)[0]!.trim() : loc);
  const suburb = derivedSuburb || "—";
  const addressLine = loc.includes(",") ? loc.split(",")[0]!.trim() : loc || "—";
  const persistedMinutes = resolveReportingDurationMinutes(row);
  const durationHours =
    persistedMinutes != null && persistedMinutes > 0
      ? Math.round((persistedMinutes / 60) * 10) / 10
      : null;

  const breakdown = parseStoredPriceBreakdown(row.price_breakdown);
  const priceDisplayFromCheckout = breakdown != null || row.pricing_summary != null;

  const scheduledAt =
    scheduleConfirmed && date && time
      ? `${date}T${time.length === 5 ? `${time}:00` : time}`
      : row.created_at;
  const checkoutPriceContext = priceDisplayFromCheckout ? { bookingId: row.id } : null;
  const serviceCounts = roomsBathroomsCountsFromServiceDetails(row.service_details);

  return {
    id: row.id,
    serviceName: serviceLabelFromBookingRow(row) ?? "Cleaning service",
    date,
    time,
    addressLine,
    suburb,
    priceZar: priceZarFromRow(row),
    status: normalizeStatus(row.status),
    durationHours,
    rooms: snapshotRooms(snapshot, row.rooms ?? serviceCounts.rooms, row.bathrooms ?? serviceCounts.bathrooms, row),
    extras: extrasDisplayFromRow(row, snapshot),
    cleanDetails: cleanDetailLinesFromServiceDetails(row.service_details),
    accessNotes: accessNotesFromBookingRow(row),
    scheduleConfirmed,
    priceLines: priceLinesFromRow(row),
    cleaner: cleanerFromRow(row),
    paystackReference: row.paystack_reference,
    createdAt: row.created_at,
    scheduledAt,
    raw: row,
    priceDisplayFromCheckout,
    checkoutPriceContext,
    pricingAlgorithmVersion: breakdown?.pricingVersion ?? null,
  };
}

/**
 * Builds a clean, human-readable location label from a booking's address line
 * and suburb, dropping empty/placeholder ("—") parts and de-duping when the
 * address line equals the suburb. Avoids ugly output like "—, Claremont" when
 * only a suburb is on record.
 */
export function formatBookingLocation(
  b: Pick<DashboardBooking, "addressLine" | "suburb">,
): string {
  const parts = [b.addressLine, b.suburb]
    .map((p) => (p ?? "").trim())
    .filter((p) => p.length > 0 && p !== "—");
  const unique = parts.filter((p, i) => parts.indexOf(p) === i);
  return unique.join(", ") || "—";
}

export function isUpcomingBookingRow(b: DashboardBooking): boolean {
  if (isAuthoritativeBookingCompleted({ status: b.raw.status ?? b.status, completed_at: b.raw.completed_at })) return false;
  const st = b.status;
  if (st === "cancelled" || st === "failed") return false;
  const t = new Date(b.scheduledAt).getTime();
  if (!Number.isFinite(t)) return true;
  return t >= Date.now() - 24 * 60 * 60 * 1000;
}

export function formatBookingWhen(date: string, time: string): string {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return "—";
  const [y, m, d] = date.split("-").map(Number);
  const label = new Date(y, m - 1, d).toLocaleDateString("en-ZA", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  return time ? `${label} · ${time}` : label;
}
